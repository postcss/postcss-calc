/* oxlint-disable complexity, no-bitwise */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  collectBenchmarkProvenance,
  DECISION_CONFIG_VERSION,
  DECISION_INTERVAL_METHOD,
  DRIFT_THRESHOLD,
  GROWTH_THRESHOLD,
  materializeBaseline,
  MIN_VALID_BLOCKS,
  NON_REGRESSION_MARGIN,
  normalizeSeed,
  PRECISION_METHOD,
  runChild,
  seededShuffle,
  validateSchemaV2Artifact,
} from './benchmark.js';
import {
  PARSER_MEASURED_BATCHES,
  PARSER_TARGET_BATCH_MS,
  PARSER_WARMUP_MAXIMUM,
  PARSER_WARMUP_MINIMUM,
  parserWorkloads,
  endpointKey,
} from './parser-workloads.js';
import { analyzeParser } from './parser-analysis.js';

const WORKER = fileURLToPath(
  new URL('./parser-benchmark-worker.js', import.meta.url)
);

export function runParserBenchmark({
  root = process.cwd(),
  benchmark = 'arithmetic-chains',
  baseline = 'HEAD',
  blocks = MIN_VALID_BLOCKS,
  maxAttempts = Math.max(30, blocks),
  seed = 0x51f15eed,
  output,
} = {}) {
  if (
    !Number.isInteger(blocks) ||
    blocks < MIN_VALID_BLOCKS ||
    blocks % 2 !== 0
  )
    throw new TypeError(
      `--blocks must be an even integer of at least ${MIN_VALID_BLOCKS}`
    );
  if (!Number.isInteger(maxAttempts) || maxAttempts < blocks)
    throw new TypeError('--max-attempts must be an integer at least --blocks');
  const normalizedSeed = normalizeSeed(seed);
  const workloads = parserWorkloads(benchmark);
  const workloadKeys = workloads.map((item) => item.key);
  const config = {
    decisionConfigVersion: DECISION_CONFIG_VERSION,
    benchmark,
    baseline,
    requestedBlocks: blocks,
    minimumBlocks: MIN_VALID_BLOCKS,
    maxAttempts,
    targetBatchMs: PARSER_TARGET_BATCH_MS,
    warmupMinimum: PARSER_WARMUP_MINIMUM,
    warmupMaximum: PARSER_WARMUP_MAXIMUM,
    measuredBatchCount: PARSER_MEASURED_BATCHES,
    driftThreshold: DRIFT_THRESHOLD,
    bootstrapResamples: 100_000,
    confidence: 0.95,
    runtimeNonRegressionMargin: NON_REGRESSION_MARGIN,
    equivalenceMargin: 1.1,
    precisionMargin: 1.1,
    precisionMethod: PRECISION_METHOD,
    growthThreshold: GROWTH_THRESHOLD,
    orderInteractionThreshold: Math.log(1.1),
    intervalMethod: DECISION_INTERVAL_METHOD,
  };
  const environment = collectBenchmarkProvenance(root, {
    baselineRef: baseline,
    benchmark: `parser-${benchmark}`,
    command: process.argv.join(' '),
  });
  const materialized = materializeBaseline(root, baseline);
  try {
    const attempts = [];
    const validBlocks = [];
    const processSchedule = seededShuffle(
      Array.from({ length: blocks }, (_, index) =>
        index < blocks / 2 ? 'baseline-first' : 'candidate-first'
      ),
      normalizedSeed
    );
    let correctnessFailure = null;
    let attempt = 0;
    while (validBlocks.length < blocks && attempt < maxAttempts) {
      const blockSeed =
        (normalizedSeed + Math.imul(attempt + 1, 0x9e3779b9)) >>> 0;
      const order = seededShuffle(workloads, blockSeed);
      // Rejected attempts retry the same acceptance slot. This preserves the
      // randomized, balanced process-order schedule among retained blocks.
      const processOrder = processSchedule[validBlocks.length];
      const revisions = [];
      const sources =
        processOrder === 'baseline-first'
          ? [
              ['baseline', materialized.sourceRoot],
              ['candidate', join(root, 'src')],
            ]
          : [
              ['candidate', join(root, 'src')],
              ['baseline', materialized.sourceRoot],
            ];
      for (const [revision, sourceRoot] of sources) {
        const child = runChild(
          WORKER,
          {
            sourceRoot,
            revision,
            processOrder,
            workloads: order,
            targetBatchMs: config.targetBatchMs,
            warmupMinimum: config.warmupMinimum,
            warmupMaximum: config.warmupMaximum,
            measuredBatchCount: config.measuredBatchCount,
          },
          root
        );
        revisions.push(child);
      }
      const drift = revisions.map((revision) =>
        Math.abs(
          controlMedian(revision.controlAfter) /
            controlMedian(revision.controlBefore) -
            1
        )
      );
      const structural = new Map(
        revisions.flatMap((revision) =>
          revision.workloads.map((workload) => [
            `${revision.revision}:${workload.key}`,
            workload.structural,
          ])
        )
      );
      const mismatches = workloadKeys.filter(
        (key) =>
          structural.get(`baseline:${key}`) !==
          structural.get(`candidate:${key}`)
      );
      const rejected =
        drift.some((value) => value > config.driftThreshold) ||
        mismatches.length > 0;
      const rejectionReasons = [
        ...(drift.some((value) => value > config.driftThreshold)
          ? ['drift']
          : []),
        ...(mismatches.length > 0 ? ['structural-mismatch'] : []),
      ];
      const record = {
        index: attempt,
        seed: blockSeed,
        processOrder,
        workloadOrder: order.map(endpointKey),
        rejected,
        rejectionReasons,
        rejectionReason: rejectionReasons.join('+') || null,
        drift,
        structuralMismatches: mismatches,
        revisions,
      };
      attempts.push(record);
      if (mismatches.length > 0) {
        correctnessFailure = record;
        break;
      }
      if (!rejected) validBlocks.push(record);
      attempt++;
    }
    const artifact = {
      schema: 2,
      benchmark: `parser-${benchmark}`,
      seed: normalizedSeed,
      config,
      environment,
      workloadKeys,
      workloads: workloads.map((workload) =>
        Object.fromEntries(
          Object.entries(workload).filter(([key]) => key !== 'source')
        )
      ),
      attempts,
      blocks: validBlocks,
    };
    if (correctnessFailure) {
      artifact.analysis = {
        status: 'correctness-failure',
        validBlocks: validBlocks.length,
        reason: 'baseline and candidate parser structures differ',
        attempt: correctnessFailure.index,
        structuralMismatches: correctnessFailure.structuralMismatches,
      };
    } else if (validBlocks.length >= MIN_VALID_BLOCKS) {
      artifact.analysis = analyzeParser(artifact);
    } else {
      artifact.analysis = {
        status: 'inconclusive',
        validBlocks: validBlocks.length,
        reason: 'fewer than twenty valid blocks',
      };
    }
    validateSchemaV2Artifact(artifact);
    const path = output
      ? resolve(root, output)
      : join(
          root,
          'reports/benchmarks',
          `${benchmark}-${Date.now()}-${normalizedSeed}.json`
        );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
    if (correctnessFailure)
      throw new Error(
        `parser structural mismatch in attempt ${correctnessFailure.index}: ${correctnessFailure.structuralMismatches.join(', ')}`
      );
    return { artifact, path };
  } finally {
    materialized.cleanup();
  }
}

function controlMedian(control) {
  return typeof control === 'number' ? control : control.medianMs;
}
