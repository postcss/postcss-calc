import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCorpus } from './corpus.js';
/* oxlint-disable no-bitwise */
import { rootShape, stableHash, validateCorpus } from './corpus-policy.js';
import {
  BOOTSTRAP_RESAMPLES,
  CORPUS_EQUIVALENCE_MARGIN,
  DECISION_CONFIG_VERSION,
  DRIFT_THRESHOLD,
  MEASURED_BATCHES,
  MIN_VALID_BLOCKS,
  PRECISION_METHOD,
  TARGET_BATCH_MS,
  balancedSchedule,
  collectBenchmarkProvenance,
  decisionConfigForArtifact,
  CORPUS_INTERVAL_METHOD,
  median,
  normalizeSeed,
  ordinaryInterval,
  percentile,
  runChild,
  seededRandom,
  seededShuffle,
  variationMetrics,
  validateSchemaV2Artifact,
} from './benchmark.js';

export { CORPUS_EQUIVALENCE_MARGIN } from './benchmark.js';

export const CORPUS_ESTIMAND =
  'Relative total runtime over the fixed set of unique harvested expressions accepted equivalently by both implementations.';

const WORKER = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  'corpus-benchmark-worker.js'
);

function parseArgs(args) {
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

export function groupResults(
  replicates,
  seed = 0,
  resamples = BOOTSTRAP_RESAMPLES
) {
  const groups = new Map();
  for (const replicate of replicates)
    for (const batch of replicate.batches)
      for (const measurement of batch.measurements) {
        const key = measurement.group;
        if (!Number.isInteger(replicate.replicate))
          throw new TypeError('corpus worker omitted its replicate number');
        const values = groups.get(key) ?? [];
        values.push({
          replicate: replicate.replicate,
          order: batch.order,
          ours: measurement.ours.ms,
          reference: measurement.reference.ms,
          oursChecksum: measurement.ours.checksum,
          referenceChecksum: measurement.reference.checksum,
        });
        groups.set(key, values);
      }
  const result = {};
  for (const [group, values] of groups) {
    const byReplicate = new Map();
    for (const value of values) {
      const current = byReplicate.get(value.replicate) ?? {
        ours: [],
        reference: [],
        checksums: [],
        byOrder: { 'ours-first': [], 'reference-first': [] },
      };
      current.ours.push(value.ours);
      current.reference.push(value.reference);
      current.checksums.push([value.oursChecksum, value.referenceChecksum]);
      current.byOrder[value.order].push(value);
      byReplicate.set(value.replicate, current);
    }
    const replicatePairs = [...byReplicate.values()].map((value) => {
      const orderRatios = ['ours-first', 'reference-first'].map((order) => {
        const measurements = value.byOrder[order];
        if (measurements.length === 0)
          throw new RangeError(
            `corpus replicate omitted ${order} measurements`
          );
        return (
          median(measurements.map((item) => item.ours)) /
          median(measurements.map((item) => item.reference))
        );
      });
      return orderRatios;
    });
    const ratios = replicatePairs.map(([oursFirst, referenceFirst]) =>
      Math.exp((Math.log(oursFirst) + Math.log(referenceFirst)) / 2)
    );
    const logs = ratios.map(Math.log);
    const ordinary = ordinaryInterval(logs);
    const groupSeed =
      (seed ^ Number.parseInt(stableHash(group).slice(0, 8), 16)) >>> 0;
    const byOrder = {};
    for (const [orderIndex, order] of [
      'ours-first',
      'reference-first',
    ].entries()) {
      const orderRatios = replicatePairs.map((pair) => pair[orderIndex]);
      const orderInterval = ordinaryInterval(orderRatios.map(Math.log));
      byOrder[order] = {
        replicates: orderRatios.length,
        ratios: orderRatios,
        geometricMeanPairedRuntimeRatio: Math.exp(orderInterval.mean),
        ordinary95: {
          lowerRatio: Math.exp(orderInterval.lower),
          upperRatio: Math.exp(orderInterval.upper),
        },
      };
    }
    const oursFirst = byOrder['ours-first'].ratios;
    const referenceFirst = byOrder['reference-first'].ratios;
    const pairedOrderLogs = oursFirst.map((ratio, index) =>
      Math.log(referenceFirst[index] / ratio)
    );
    const orderEffect = ordinaryInterval(pairedOrderLogs);
    const bootstrap = bootstrapPairedReplicateInterval(
      replicatePairs.map((pair) => pair.map(Math.log)),
      groupSeed,
      resamples,
      0.95
    );
    result[group] = {
      replicates: ratios.length,
      geometricMeanPairedRuntimeRatio: Math.exp(ordinary.mean),
      ordinary95: {
        lowerRatio: Math.exp(ordinary.lower),
        upperRatio: Math.exp(ordinary.upper),
      },
      bootstrap95: {
        lowerRatio: Math.exp(bootstrap.lower),
        upperRatio: Math.exp(bootstrap.upper),
        resamples: bootstrap.resamples,
      },
      bootstrap90: (() => {
        const interval = bootstrapPairedReplicateInterval(
          replicatePairs.map((pair) => pair.map(Math.log)),
          (groupSeed ^ 0x9e3779b9) >>> 0,
          resamples,
          0.9
        );
        return {
          lowerRatio: Math.exp(interval.lower),
          upperRatio: Math.exp(interval.upper),
          resamples: interval.resamples,
        };
      })(),
      bootstrapSeed: groupSeed,
      bootstrapMethod: CORPUS_INTERVAL_METHOD,
      byOrder,
      orderEffect: {
        logRatio: orderEffect.mean,
        ratio: Math.exp(orderEffect.mean),
        ordinary95: {
          lowerRatio: Math.exp(orderEffect.lower),
          upperRatio: Math.exp(orderEffect.upper),
        },
      },
      withinProcessBatchVariation: withinProcessVariation(values),
      betweenProcessVariation: variationMetrics(ratios),
      ratios,
      checksums: [
        ...new Set(
          values.flatMap((value) => [
            value.oursChecksum,
            value.referenceChecksum,
          ])
        ),
      ],
    };
  }
  return result;
}

function bootstrapPairedReplicateInterval(pairs, seed, resamples, confidence) {
  if (!Array.isArray(pairs) || pairs.length === 0)
    throw new RangeError('cannot bootstrap an empty replicate set');
  if (pairs.some((pair) => !Array.isArray(pair) || pair.length !== 2))
    throw new TypeError(
      'each corpus replicate must contain both order results'
    );
  const random = seededRandom(seed);
  const means = Array.from({ length: resamples }, () => 0);
  for (let sample = 0; sample < resamples; sample++) {
    for (let index = 0; index < pairs.length; index++) {
      const pair = pairs[Math.floor(random() * pairs.length)];
      means[sample] += (pair[0] + pair[1]) / (2 * pairs.length);
    }
  }
  const alpha = (1 - confidence) / 2;
  const lower = percentile(means, alpha);
  const upper = percentile(means, 1 - alpha);
  return { lower, upper, resamples };
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

function corpusGroupDecision(summary, config) {
  const logs = summary.ratios.map(Math.log);
  const sd = variationMetrics(logs).sd;
  const intervalLower = Math.log(summary.bootstrap95.lowerRatio);
  const intervalUpper = Math.log(summary.bootstrap95.upperRatio);
  const estimate = Math.log(summary.geometricMeanPairedRuntimeRatio);
  const intervalHalfWidth = Math.max(
    estimate - intervalLower,
    intervalUpper - estimate
  );
  const targetHalfWidth = Math.log(config.precisionMargin);
  const precisionMet =
    summary.replicates >= config.minimumBlocks &&
    intervalHalfWidth <= targetHalfWidth;
  let statistical = 'inconclusive';
  if (precisionMet && summary.bootstrap95.upperRatio < 1)
    statistical = 'postcss-calc faster';
  else if (precisionMet && summary.bootstrap95.lowerRatio > 1)
    statistical = 'postcss-calc slower';
  let practical = 'inconclusive';
  if (precisionMet) {
    practical =
      summary.bootstrap90.lowerRatio >= 1 / config.equivalenceMargin &&
      summary.bootstrap90.upperRatio <= config.equivalenceMargin
        ? 'equivalent'
        : 'not-equivalent';
  }
  return {
    statistical,
    practical,
    observedLogRatioSd: sd,
    observedStandardDeviation: sd,
    confidenceIntervalWidth: intervalUpper - intervalLower,
    intervalHalfWidth,
    targetHalfWidth,
    minimumBlocks: config.minimumBlocks,
    requestedBlocks: config.requestedBlocks,
    observedBlocks: summary.replicates,
    precisionTargetMet: precisionMet,
  };
}

function analyzeCorpusObservations({ groups, replicates, config, seed }) {
  const decisions = Object.fromEntries(
    Object.entries(groups).map(([group, summary]) => [
      group,
      corpusGroupDecision(summary, config),
    ])
  );
  const exactDecision = decisions.exact;
  const orderDiagnostic =
    Math.abs(groups.exact.orderEffect.logRatio) >
    config.orderInteractionThreshold;
  const status = orderDiagnostic ? 'inconclusive' : exactDecision.statistical;
  const practicalStatus = orderDiagnostic
    ? 'inconclusive'
    : exactDecision.practical;
  return {
    status,
    statistical: {
      status,
      intervalMethod: config.intervalMethod,
      confidence: 0.95,
      equivalenceComparison: 'superiority-on-fixed-corpus',
    },
    practical: {
      status: practicalStatus,
      margin: config.equivalenceMargin,
      interpretation:
        practicalStatus === 'equivalent'
          ? 'within declared margin, not identical'
          : practicalStatus,
      intervalMethod: config.intervalMethod,
      confidence: 0.9,
    },
    decisions,
    orderEffect: groups.exact.orderEffect,
    diagnostics: {
      orderInteraction: orderDiagnostic,
      orderInteractionThreshold: config.orderInteractionThreshold,
      replicates: replicates.length,
      seed,
    },
  };
}

/** Recompute corpus decisions from retained raw benchmark observations. */
export function analyzeCorpus(artifact) {
  if (!artifact || artifact.benchmark !== 'corpus')
    throw new TypeError('expected a corpus artifact');
  if (artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION)
    validateSchemaV2Artifact(artifact);
  const config = decisionConfigForArtifact(artifact, 'corpus');
  const groups = groupResults(
    artifact.replicates,
    artifact.seed,
    config.bootstrapResamples
  );
  const result = {
    ...analyzeCorpusObservations({
      groups,
      replicates: artifact.replicates,
      config,
      seed: artifact.seed,
    }),
    aggregate: groups.exact,
    groups,
  };
  if (
    artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION &&
    artifact.analysis
  )
    assertStoredAnalysisMatches(artifact.analysis, result);
  return result;
}

function assertStoredAnalysisMatches(stored, expected, path = 'analysis') {
  if (
    !stored ||
    typeof stored !== 'object' ||
    Array.isArray(stored) ||
    !expected ||
    typeof expected !== 'object' ||
    Array.isArray(expected)
  )
    throw new TypeError(`${path} is not a statistical summary object`);
  const storedKeys = Object.keys(stored).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (JSON.stringify(storedKeys) !== JSON.stringify(expectedKeys))
    throw new TypeError(`${path} does not match recomputed observations`);
  for (const key of expectedKeys) {
    const left = stored[key];
    const right = expected[key];
    if (typeof right === 'number') {
      if (
        typeof left !== 'number' ||
        !Number.isFinite(left) ||
        Math.abs(left - right) > 1e-10 * Math.max(1, Math.abs(right))
      )
        throw new TypeError(
          `${path}.${key} does not match recomputed observations`
        );
    } else if (Array.isArray(right)) {
      if (!Array.isArray(left) || left.length !== right.length)
        throw new TypeError(
          `${path}.${key} does not match recomputed observations`
        );
      for (let index = 0; index < right.length; index++)
        assertStoredValue(
          left[index],
          right[index],
          `${path}.${key}[${index}]`
        );
    } else if (right && typeof right === 'object') {
      assertStoredAnalysisMatches(left, right, `${path}.${key}`);
    } else if (left !== right) {
      throw new TypeError(
        `${path}.${key} does not match recomputed observations`
      );
    }
  }
}

function assertStoredValue(left, right, path) {
  if (typeof right === 'number') {
    if (
      typeof left !== 'number' ||
      !Number.isFinite(left) ||
      Math.abs(left - right) > 1e-10 * Math.max(1, Math.abs(right))
    )
      throw new TypeError(`${path} does not match recomputed observations`);
  } else if (Array.isArray(right)) {
    if (!Array.isArray(left) || left.length !== right.length)
      throw new TypeError(`${path} does not match recomputed observations`);
    for (let index = 0; index < right.length; index++)
      assertStoredValue(left[index], right[index], `${path}[${index}]`);
  } else if (right && typeof right === 'object') {
    assertStoredAnalysisMatches(left, right, path);
  } else if (left !== right) {
    throw new TypeError(`${path} does not match recomputed observations`);
  }
}

export { parseArgs };

function withinProcessVariation(values) {
  const normalized = [];
  const byReplicate = new Map();
  for (const value of values) {
    const current = byReplicate.get(value.replicate) ?? {
      ours: [],
      reference: [],
    };
    current.ours.push(value.ours);
    current.reference.push(value.reference);
    byReplicate.set(value.replicate, current);
  }
  for (const value of byReplicate.values()) {
    const oursCenter = median(value.ours);
    const referenceCenter = median(value.reference);
    normalized.push(
      ...value.ours.map((sample) => sample / oursCenter),
      ...value.reference.map((sample) => sample / referenceCenter)
    );
  }
  return variationMetrics(normalized).relativeSpan;
}
