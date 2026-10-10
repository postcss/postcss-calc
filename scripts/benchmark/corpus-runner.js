/* oxlint-disable no-bitwise */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCorpus } from '../lib/corpus.js';
import { rootShape, stableHash, validateCorpus } from '../lib/corpus-policy.js';
import {
  BOOTSTRAP_RESAMPLES,
  CORPUS_EQUIVALENCE_MARGIN,
  CORPUS_INTERVAL_METHOD,
  DECISION_CONFIG_VERSION,
  DRIFT_THRESHOLD,
  MEASURED_BATCHES,
  MIN_VALID_BLOCKS,
  PRECISION_METHOD,
  TARGET_BATCH_MS,
  balancedSchedule,
  collectBenchmarkProvenance,
  normalizeSeed,
  percentile,
  runChild,
  seededShuffle,
  validateSchemaV2Artifact,
} from './benchmark.js';
import { analyzeCorpusObservations } from './corpus-decisions.js';
import { groupResults } from './corpus-group-results.js';

export const CORPUS_ESTIMAND =
  'Relative total runtime over the fixed set of unique harvested expressions accepted equivalently by both implementations.';

const WORKER = fileURLToPath(
  new URL('./corpus-benchmark-worker.js', import.meta.url)
);

export function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--seed') options.seed = Number(args[++i]);
    else if (arg === '--replicates') options.replicates = Number(args[++i]);
    else if (arg === '--output') options.output = args[++i];
    else throw new TypeError(`invalid option: ${arg}`);
  }
  if (
    options.seed !== undefined &&
    (!Number.isInteger(options.seed) ||
      options.seed < 0 ||
      options.seed > 0xffffffff)
  )
    throw new TypeError('invalid --seed');
  if (
    options.replicates !== undefined &&
    (!Number.isInteger(options.replicates) || options.replicates < 20)
  )
    throw new TypeError('--replicates must be at least 20');
  return options;
}

export function runCorpusBenchmark({
  root = process.cwd(),
  seed = 0x71c0ffee,
  replicates = 20,
  output,
} = {}) {
  const normalizedSeed = normalizeSeed(seed);
  const source = loadCorpus();
  const validation = validateCorpus(source);
  const corpusPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'test/corpus/github-pure.txt'
  );
  const config = {
    decisionConfigVersion: DECISION_CONFIG_VERSION,
    requestedBlocks: replicates,
    minimumBlocks: MIN_VALID_BLOCKS,
    maxAttempts: replicates,
    targetBatchMs: TARGET_BATCH_MS,
    warmupMinimum: 0,
    warmupMaximum: 0,
    measuredBatchCount: MEASURED_BATCHES,
    driftThreshold: DRIFT_THRESHOLD,
    bootstrapResamples: BOOTSTRAP_RESAMPLES,
    confidence: 0.95,
    runtimeNonRegressionMargin: 1.1,
    equivalenceMargin: CORPUS_EQUIVALENCE_MARGIN,
    precisionMargin: CORPUS_EQUIVALENCE_MARGIN,
    precisionMethod: PRECISION_METHOD,
    growthThreshold: 2.5,
    orderInteractionThreshold: Math.log(1.1),
    intervalMethod: CORPUS_INTERVAL_METHOD,
    batches: 6,
    calibrationOrderBalanced: true,
    corpus: 'test/corpus/github-pure.txt',
    precision: 10,
  };
  const environment = collectBenchmarkProvenance(root, {
    benchmark: 'corpus',
    corpusPath,
    command: process.argv.join(' '),
  });
  let entries = validation.accepted.map((record) => ({
    input: record.input,
    canonical: record.canonical,
    shape: rootShape(record.input),
    sourceLength: record.input.length,
  }));
  if (!entries.length) throw new Error('corpus validation accepted no inputs');
  const lengthOrder = [...entries].sort(
    (a, b) => a.sourceLength - b.sourceLength || a.input.localeCompare(b.input)
  );
  const lengthStratumByInput = new Map(
    lengthOrder.map((entry, index) => [
      entry.input,
      `source-length-q${Math.min(4, Math.floor((index * 4) / entries.length) + 1)}`,
    ])
  );
  entries = entries.map((entry) => ({
    ...entry,
    lengthStratum: lengthStratumByInput.get(entry.input),
  }));
  const lengthQuartiles = [0.25, 0.5, 0.75].map((p) =>
    percentile(
      entries.map((entry) => entry.sourceLength),
      p
    )
  );
  const temp = mkdtempSync(join(root, '.corpus-benchmark-'));
  const corpusFile = join(temp, 'validated.json');
  writeFileSync(corpusFile, JSON.stringify(entries));
  try {
    const childResults = [];
    const calibrationSchedule = balancedSchedule(
      replicates,
      'ours-first',
      'reference-first',
      normalizedSeed ^ 0x243f6a88
    );
    for (let replicate = 0; replicate < replicates; replicate++) {
      const permutation = seededShuffle(
        entries.map((_, index) => index),
        (normalizedSeed + Math.imul(replicate + 1, 0x9e3779b9)) >>> 0
      );
      const orders = seededShuffle(
        [
          'ours-first',
          'ours-first',
          'ours-first',
          'reference-first',
          'reference-first',
          'reference-first',
        ],
        (normalizedSeed ^ replicate) >>> 0
      );
      const calibrationOrder = calibrationSchedule[replicate];
      childResults.push(
        runChild(
          WORKER,
          {
            sourceRoot: join(root, 'src'),
            corpusFile,
            permutation,
            orders,
            calibrationOrder,
            targetBatchMs: config.targetBatchMs,
            replicate,
            lengthQuartiles,
          },
          root
        )
      );
    }
    const groups = groupResults(
      childResults,
      normalizedSeed,
      config.bootstrapResamples
    );
    const exact = groups.exact;
    const analysis = analyzeCorpusObservations({
      groups,
      replicates: childResults,
      config,
      seed: normalizedSeed,
    });
    const artifact = {
      schema: 2,
      benchmark: 'corpus',
      seed: normalizedSeed,
      environment,
      config: { ...config, replicates },
      correctness: {
        counts: validation.counts,
        categoryHashes: validation.categoryHashes,
        accepted: entries.length,
        totalSourceRecords: source.length,
        uniqueRecords: new Set(source).size,
        acceptedComparisonRecords: entries.length,
        excludedCounts: Object.fromEntries(
          Object.entries(validation.counts).filter(
            ([key]) => key !== 'accepted'
          )
        ),
        weighting: 'unique-weighted',
        estimand: CORPUS_ESTIMAND,
        corpusHash: stableHash(source.join('\n')),
        inputHash: stableHash(
          entries
            .map((entry) => entry.input)
            .sort()
            .join('\n')
        ),
      },
      corpus: {
        lengthQuartiles,
        lengthStrata: Object.fromEntries(
          [
            'source-length-q1',
            'source-length-q2',
            'source-length-q3',
            'source-length-q4',
          ].map((group) => [
            group,
            entries.filter((entry) => entry.lengthStratum === group).length,
          ])
        ),
        rootShapeCounts: Object.fromEntries(
          [...new Set(entries.map((entry) => entry.shape))]
            .sort()
            .map((shape) => [
              shape,
              entries.filter((entry) => entry.shape === shape).length,
            ])
        ),
      },
      replicates: childResults,
      analysis: { ...analysis, aggregate: exact, groups },
    };
    validateSchemaV2Artifact(artifact);
    const path = output
      ? resolve(root, output)
      : join(
          root,
          'reports/benchmarks',
          `corpus-${Date.now()}-${normalizedSeed}.json`
        );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
    return { artifact, path };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
