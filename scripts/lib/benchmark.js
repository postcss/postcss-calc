/* oxlint-disable no-bitwise, complexity */
// Small, deterministic benchmark primitives.  This module intentionally has
// no third-party dependencies: benchmark results should be reproducible with
// the package's normal development installation.
import {
  readFileSync,
  readdirSync,
  statSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpus, loadavg, platform, release, arch } from 'node:os';
import { join, relative } from 'node:path';
import {
  CORPUS_CATEGORIES,
  NEUTRAL_CORPUS_CATEGORIES,
} from './corpus-policy.js';

export const TARGET_BATCH_MS = 25;
export const MIN_WARMUPS = 5;
export const MAX_WARMUPS = 10;
export const MEASURED_BATCHES = 6;
export const DRIFT_THRESHOLD = 0.15;
export const BOOTSTRAP_RESAMPLES = 100_000;
export const NON_REGRESSION_MARGIN = 1.1;
export const CORPUS_EQUIVALENCE_MARGIN = 1.1;
export const GROWTH_THRESHOLD = 2.5;
export const MIN_VALID_BLOCKS = 20;
export const DECISION_CONFIG_VERSION = 3;
export const PRECISION_METHOD = 'family-adjusted-interval-width';
export const DECISION_INTERVAL_METHOD =
  'stratified-max-t-studentized-bootstrap';
export const CORPUS_INTERVAL_METHOD =
  'paired-replicate-order-log-ratio-bootstrap';

// These are the fields that determine the interpretation of a schema-v2
// artifact.  Keep this list here rather than duplicating it in the parser and
// corpus analyzers: a reanalysis must have one authoritative contract.
export const DECISION_CONFIG_KEYS = [
  'decisionConfigVersion',
  'requestedBlocks',
  'minimumBlocks',
  'maxAttempts',
  'targetBatchMs',
  'warmupMinimum',
  'warmupMaximum',
  'measuredBatchCount',
  'driftThreshold',
  'bootstrapResamples',
  'confidence',
  'runtimeNonRegressionMargin',
  'equivalenceMargin',
  'precisionMargin',
  'growthThreshold',
  'orderInteractionThreshold',
  'precisionMethod',
  'intervalMethod',
];

/** @param {object} config @param {string} kind */
export function validateDecisionConfig(config, kind = 'artifact') {
  if (!config || typeof config !== 'object')
    throw new TypeError(`${kind} is missing decision configuration`);
  for (const key of DECISION_CONFIG_KEYS)
    if (!Object.hasOwn(config, key))
      throw new TypeError(`${kind} is missing decision parameter ${key}`);
  if (config.decisionConfigVersion !== DECISION_CONFIG_VERSION)
    throw new TypeError(
      `${kind} has an invalid decision configuration version`
    );
  for (const key of [
    'requestedBlocks',
    'minimumBlocks',
    'maxAttempts',
    'measuredBatchCount',
    'bootstrapResamples',
  ])
    if (!Number.isInteger(config[key]) || config[key] <= 0)
      throw new TypeError(`${kind} has invalid decision parameter ${key}`);
  if (config.requestedBlocks < config.minimumBlocks)
    throw new TypeError(`${kind} has an invalid requested block count`);
  if (config.maxAttempts < config.requestedBlocks)
    throw new TypeError(`${kind} has an invalid maxAttempts`);
  for (const key of ['warmupMinimum', 'warmupMaximum'])
    if (!Number.isInteger(config[key]) || config[key] < 0)
      throw new TypeError(`${kind} has invalid decision parameter ${key}`);
  if (config.warmupMaximum < config.warmupMinimum)
    throw new TypeError(`${kind} has an invalid warm-up range`);
  for (const key of [
    'targetBatchMs',
    'driftThreshold',
    'bootstrapResamples',
    'runtimeNonRegressionMargin',
    'equivalenceMargin',
    'precisionMargin',
    'growthThreshold',
    'orderInteractionThreshold',
  ])
    if (
      typeof config[key] !== 'number' ||
      !Number.isFinite(config[key]) ||
      config[key] <= 0
    )
      throw new TypeError(`${kind} has invalid decision parameter ${key}`);
  if (
    typeof config.confidence !== 'number' ||
    !Number.isFinite(config.confidence) ||
    config.confidence <= 0 ||
    config.confidence >= 1
  )
    throw new TypeError(`${kind} has invalid decision parameter confidence`);
  if (config.runtimeNonRegressionMargin < 1 || config.equivalenceMargin < 1)
    throw new TypeError(`${kind} has an invalid ratio margin`);
  if (config.precisionMargin < 1 || config.growthThreshold <= 1)
    throw new TypeError(`${kind} has an invalid precision or growth margin`);
  if (
    ![DECISION_INTERVAL_METHOD, CORPUS_INTERVAL_METHOD].includes(
      config.intervalMethod
    )
  )
    throw new TypeError(`${kind} has an invalid interval method`);
  if (config.precisionMethod !== PRECISION_METHOD)
    throw new TypeError(`${kind} has an invalid precision method`);
  return config;
}

/**
 * Migrate the pre-contract artifacts that were emitted by the first schema-v2
 * implementation.  This is intentionally the only place where repository
 * defaults are applied. New artifacts must carry decisionConfigVersion: 3.
 */
export function migrateLegacyDecisionConfig(
  artifact,
  kind = artifact?.benchmark === 'corpus' ? 'corpus' : 'parser'
) {
  const source = artifact?.config ?? {};
  const blocks = artifact?.blocks?.length ?? artifact?.replicates?.length ?? 0;
  const requestedBlocks =
    source.requestedBlocks ?? source.blocks ?? source.replicates ?? blocks;
  const base = {
    decisionConfigVersion: DECISION_CONFIG_VERSION,
    requestedBlocks,
    minimumBlocks: source.minimumBlocks ?? MIN_VALID_BLOCKS,
    maxAttempts: source.maxAttempts ?? Math.max(30, requestedBlocks),
    targetBatchMs: source.targetBatchMs ?? TARGET_BATCH_MS,
    warmupMinimum:
      source.warmupMinimum ?? (kind === 'corpus' ? 0 : MIN_WARMUPS),
    warmupMaximum:
      source.warmupMaximum ?? (kind === 'corpus' ? 0 : MAX_WARMUPS),
    measuredBatchCount:
      source.measuredBatchCount ?? source.batches ?? MEASURED_BATCHES,
    driftThreshold: source.driftThreshold ?? DRIFT_THRESHOLD,
    bootstrapResamples: source.bootstrapResamples ?? BOOTSTRAP_RESAMPLES,
    confidence: source.confidence ?? 0.95,
    runtimeNonRegressionMargin:
      source.runtimeNonRegressionMargin ?? NON_REGRESSION_MARGIN,
    equivalenceMargin:
      source.equivalenceMargin ??
      (kind === 'corpus' ? CORPUS_EQUIVALENCE_MARGIN : 1.1),
    precisionMargin: source.precisionMargin ?? 1.1,
    precisionMethod: PRECISION_METHOD,
    growthThreshold: source.growthThreshold ?? GROWTH_THRESHOLD,
    orderInteractionThreshold:
      source.orderInteractionThreshold ?? Math.log(1.1),
    intervalMethod:
      source.intervalMethod ??
      (kind === 'corpus' ? CORPUS_INTERVAL_METHOD : DECISION_INTERVAL_METHOD),
  };
  if (kind === 'corpus')
    return {
      ...base,
      replicates: source.replicates ?? blocks,
      batches: source.batches ?? 6,
      calibrationOrderBalanced: source.calibrationOrderBalanced ?? false,
    };
  return base;
}

/** @param {object} artifact @param {string} kind @return {object} */
export function decisionConfigForArtifact(artifact, kind) {
  if (artifact?.config?.decisionConfigVersion === DECISION_CONFIG_VERSION)
    return validateDecisionConfig(artifact.config, `${kind} artifact`);
  if (artifact?.config?.decisionConfigVersion !== undefined)
    throw new TypeError(
      `${kind} artifact has an invalid decision configuration version`
    );
  return validateDecisionConfig(
    migrateLegacyDecisionConfig(artifact, kind),
    `${kind} legacy artifact`
  );
}

/** @param {unknown} seed @return {number} */
export function normalizeSeed(seed) {
  if (typeof seed === 'number') {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
      throw new TypeError('seed must be an unsigned 32-bit integer');
    return seed >>> 0;
  }
  if (typeof seed === 'string' && /^\d+$/.test(seed)) {
    const value = Number(seed);
    if (Number.isSafeInteger(value) && value <= 0xffffffff) return value >>> 0;
  }
  throw new TypeError('seed must be an unsigned 32-bit integer');
}

/** @param {number} seed @return {() => number} */
export function seededRandom(seed) {
  let state = normalizeSeed(seed) || 0x9e3779b9;
  return () => {
    state = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
    state = Math.imul(state ^ (state >>> 15), 0x735a2d97);
    state ^= state >>> 15;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

/** @template T @param {readonly T[]} values @param {number} seed @return {T[]} */
export function seededShuffle(values, seed) {
  const result = [...values];
  const random = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Return a shuffled, balanced process schedule.  Values are deliberately
 * explicit (`baseline-first`/`candidate-first`) so the artifact is auditable.
 *
 * @param {number} count
 * @param {number} seed
 */
export function balancedOrder(count, seed) {
  if (!Number.isInteger(count) || count < 2 || count % 2 !== 0)
    throw new RangeError('a balanced schedule requires a positive even count');
  return seededShuffle(
    Array.from({ length: count }, (_, index) =>
      index < count / 2 ? 'baseline-first' : 'candidate-first'
    ),
    seed
  );
}

/**
 * Return a deterministic, balanced schedule for the corpus calibration order.
 * Odd counts differ by at most one; the first label receives the extra slot.
 */
export function balancedSchedule(count, first, second, seed) {
  if (!Number.isInteger(count) || count <= 0)
    throw new RangeError('schedule count must be positive');
  if (
    typeof first !== 'string' ||
    typeof second !== 'string' ||
    first === second
  )
    throw new TypeError('schedule labels must be distinct strings');
  return seededShuffle(
    Array.from({ length: count }, (_, index) =>
      index < Math.ceil(count / 2) ? first : second
    ),
    seed
  );
}

/** @param {number} count @param {number} seed @return {number[]} */
export function bootstrapIndices(count, seed) {
  if (!Number.isInteger(count) || count <= 0)
    throw new RangeError('cannot resample an empty collection');
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => Math.floor(random() * count));
}

/** @param {number[]} values @return {number} */
function finiteValues(values) {
  if (!Array.isArray(values) || values.length === 0)
    throw new RangeError('expected a non-empty numeric array');
  if (
    values.some((value) => typeof value !== 'number' || !Number.isFinite(value))
  )
    throw new TypeError('values must be finite numbers');
  return values;
}

/** @param {number[]} values @return {number} */
export function median(values) {
  const sorted = [...finiteValues(values)].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** @param {number[]} values @param {number} p @return {number} */
export function percentile(values, p) {
  const sorted = [...finiteValues(values)].sort((a, b) => a - b);
  if (!Number.isFinite(p) || p < 0 || p > 1)
    throw new RangeError('p must be in [0, 1]');
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** @param {number[]} values @return {{median: number, q1: number, q3: number, min: number, max: number, sd: number, cv: number, relativeSpan: number}} */
export function variationMetrics(values) {
  const finite = finiteValues(values);
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance =
    finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, finite.length - 1);
  return {
    median: median(finite),
    q1: percentile(finite, 0.25),
    q3: percentile(finite, 0.75),
    min: Math.min(...finite),
    max: Math.max(...finite),
    sd: Math.sqrt(variance),
    cv: mean === 0 ? Infinity : Math.sqrt(variance) / Math.abs(mean),
    relativeSpan:
      mean === 0
        ? Infinity
        : (Math.max(...finite) - Math.min(...finite)) / Math.abs(mean),
  };
}

export function variation(values) {
  return variationMetrics(values);
}

/** @param {number[]} values @return {number} */
export function geometricMean(values) {
  const finite = finiteValues(values);
  if (finite.some((value) => value <= 0))
    throw new RangeError('geometric mean requires positive values');
  return Math.exp(
    finite.reduce((sum, value) => sum + Math.log(value), 0) / finite.length
  );
}

/** @param {number} candidate @param {number} baseline @return {number} */
export function logRatio(candidate, baseline) {
  if (
    !(candidate > 0) ||
    !(baseline > 0) ||
    !Number.isFinite(candidate) ||
    !Number.isFinite(baseline)
  )
    throw new RangeError('runtime ratios require positive finite timings');
  return Math.log(candidate / baseline);
}

/** @param {number[]} values @return {{mean: number, sd: number, lower: number, upper: number}} */
export function ordinaryInterval(values) {
  const finite = finiteValues(values);
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const sd = Math.sqrt(
    finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      Math.max(1, finite.length - 1)
  );
  const half = (1.96 * sd) / Math.sqrt(finite.length);
  return { mean, sd, lower: mean - half, upper: mean + half };
}

/** @param {number[]} values @return {{mean: number, sd: number, lower: number, upper: number}} */
export function oneSidedInterval(values) {
  const interval = ordinaryInterval(values);
  const half = (1.6448536269514722 * interval.sd) / Math.sqrt(values.length);
  return {
    ...interval,
    lower: interval.mean - half,
    upper: interval.mean + half,
  };
}

/** @param {number[]} values @return {{meanLog: number, ratio: number, ordinary: object, logValues: number[]}} */
export function pairedRatioSummary(values) {
  const logValues = finiteValues(values);
  const ordinary = ordinaryInterval(logValues);
  return {
    meanLog: ordinary.mean,
    ratio: Math.exp(ordinary.mean),
    ordinary,
    logValues,
  };
}

/** @param {number[]} values @param {number} seed @param {number} [resamples] */
export function bootstrapMeanInterval(
  values,
  seed,
  resamples = BOOTSTRAP_RESAMPLES,
  confidence = 0.95
) {
  const source = finiteValues(values);
  if (!Number.isInteger(resamples) || resamples <= 0)
    throw new RangeError('resamples must be positive');
  if (!(confidence > 0 && confidence < 1))
    throw new RangeError('confidence must be in (0, 1)');
  const random = seededRandom(seed);
  const means = Array.from({ length: resamples });
  for (let sample = 0; sample < resamples; sample++) {
    let sum = 0;
    for (let i = 0; i < source.length; i++)
      sum += source[Math.floor(random() * source.length)];
    means[sample] = sum / source.length;
  }
  return {
    lower: percentile(means, (1 - confidence) / 2),
    upper: percentile(means, 1 - (1 - confidence) / 2),
    resamples,
  };
}

/** @param {number[]} logValues @param {number} seed @param {number} [resamples] */
export function bootstrapRatioInterval(
  logValues,
  seed,
  resamples = BOOTSTRAP_RESAMPLES,
  confidence = 0.95
) {
  const interval = bootstrapMeanInterval(
    logValues,
    seed,
    resamples,
    confidence
  );
  return {
    ...interval,
    lowerRatio: Math.exp(interval.lower),
    upperRatio: Math.exp(interval.upper),
  };
}

/**
 * Bootstrap columns from the same row schedule.  A row is one complete
 * benchmark block, so all endpoints in a resample retain their correlation.
 * The returned intervals are in the input (usually log-ratio) domain.
 *
 * @param {number[][]} rows
 * @param {number} seed
 * @param {number} [familyCount]
 * @param {number} [resamples]
 */
export function bootstrapPairedIntervals(
  rows,
  seed,
  familyCount = rows[0]?.length ?? 1,
  resamples = BOOTSTRAP_RESAMPLES
) {
  if (!Array.isArray(rows) || rows.length === 0)
    throw new RangeError('cannot bootstrap an empty matrix');
  if (!Number.isInteger(resamples) || resamples <= 0)
    throw new RangeError('resamples must be positive');
  const width = rows[0]?.length;
  if (!Number.isInteger(width) || width <= 0)
    throw new RangeError('cannot bootstrap a matrix without columns');
  if (familyCount !== width)
    throw new RangeError('familyCount must equal the matrix width');
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== width) {
      throw new TypeError('bootstrap rows must have equal widths');
    }
    finiteValues(row);
  }

  const observed = Array(width).fill(0);
  for (const row of rows)
    for (let column = 0; column < width; column++)
      observed[column] += row[column];
  for (let column = 0; column < width; column++)
    observed[column] /= rows.length;

  const standardErrors = Array.from({ length: width }, (_, column) => {
    const variance =
      rows.reduce(
        (sum, row) => sum + (row[column] - observed[column]) ** 2,
        0
      ) / Math.max(1, rows.length - 1);
    return Math.sqrt(variance / rows.length);
  });
  const distributions = Array.from({ length: width }, () => Array(resamples));
  const studentizedDeviations = Array(resamples);
  const random = seededRandom(seed);
  for (let sample = 0; sample < resamples; sample++) {
    const sums = Array(width).fill(0);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[Math.floor(random() * rows.length)];
      for (let column = 0; column < width; column++)
        sums[column] += row[column];
    }
    let maxDeviation = 0;
    for (let column = 0; column < width; column++) {
      const mean = sums[column] / rows.length;
      distributions[column][sample] = mean;
      const standardError = standardErrors[column];
      let deviation;
      if (standardError === 0)
        deviation = mean === observed[column] ? 0 : Infinity;
      else deviation = Math.abs((mean - observed[column]) / standardError);
      maxDeviation = Math.max(maxDeviation, deviation);
    }
    studentizedDeviations[sample] = maxDeviation;
  }

  const familyCritical = percentile(studentizedDeviations, 0.95);
  return {
    familyCount,
    resamples,
    method: 'max-t-studentized-bootstrap',
    standardErrors,
    observed,
    intervals: distributions.map((values, column) => ({
      lower: percentile(values, 0.025),
      upper: percentile(values, 0.975),
      oneSidedLower: percentile(values, 0.05),
      oneSidedUpper: percentile(values, 0.95),
      familyLower: observed[column] - familyCritical * standardErrors[column],
      familyUpper: observed[column] + familyCritical * standardErrors[column],
      familyCritical,
    })),
  };
}

/**
 * Studentized max-T bootstrap for a two-stratum estimator. Each row is an
 * independent experimental unit and is sampled as a complete row, which
 * preserves correlation between endpoint columns.
 *
 * The observed estimator gives equal weight to the two strata. The bootstrap
 * standard error is recomputed for every resample. If a resample has zero
 * variance but its estimate differs from the observed estimate, its statistic
 * uses the observed standard error for that endpoint.
 *
 * @param {{rows: number[][], strata: string[], seed: number, resamples?: number, confidence?: number}} options
 */
export function bootstrapStratifiedMaxT({
  rows,
  strata,
  seed,
  resamples = BOOTSTRAP_RESAMPLES,
  confidence = 0.95,
}) {
  if (!Array.isArray(rows) || rows.length === 0)
    throw new RangeError('cannot bootstrap an empty matrix');
  if (!Array.isArray(strata) || strata.length !== rows.length)
    throw new RangeError('strata must match bootstrap rows');
  if (!Number.isInteger(resamples) || resamples <= 0)
    throw new RangeError('resamples must be positive');
  if (!(confidence > 0 && confidence < 1))
    throw new RangeError('confidence must be in (0, 1)');
  const width = rows[0]?.length;
  if (!Number.isInteger(width) || width <= 0)
    throw new RangeError('cannot bootstrap a matrix without columns');
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== width)
      throw new TypeError('bootstrap rows must have equal widths');
    finiteValues(row);
  }
  const labels = [...new Set(strata)];
  if (labels.length !== 2)
    throw new RangeError('stratified max-T requires exactly two strata');
  const ordered = labels.sort();
  const strataRows = ordered.map((label) =>
    rows
      .map((row, index) => ({ row, label: strata[index] }))
      .filter((item) => item.label === label)
      .map((item) => item.row)
      .sort(compareRows)
  );
  if (strataRows.some((group) => group.length === 0))
    throw new RangeError('cannot resample an empty stratum');

  const observedByStratum = strataRows.map((group) =>
    columnMeans(group, width)
  );
  const observed = Array.from(
    { length: width },
    (_, column) =>
      observedByStratum.reduce((sum, means) => sum + means[column], 0) /
      observedByStratum.length
  );
  const observedSE = standardErrorsForSample(
    observedByStratum,
    strataRows,
    width
  );
  const distributions = Array.from({ length: width }, () => []);
  const studentizedMax = [];
  let degenerateResamples = 0;
  let degenerateFallbacks = 0;
  const random = seededRandom(seed);

  for (let sample = 0; sample < resamples; sample++) {
    const sampled = strataRows.map((group) =>
      Array.from(
        { length: group.length },
        () => group[Math.floor(random() * group.length)]
      )
    );
    const sampledMeans = sampled.map((group) => columnMeans(group, width));
    const effects = Array.from(
      { length: width },
      (_, column) =>
        sampledMeans.reduce((sum, means) => sum + means[column], 0) /
        sampledMeans.length
    );
    const sampledSE = standardErrorsForSample(sampledMeans, sampled, width);
    let maxT = 0;
    let hasDegenerateEndpoint = false;
    for (let column = 0; column < width; column++) {
      distributions[column].push(effects[column]);
      let statistic;
      if (sampledSE[column] === 0) {
        hasDegenerateEndpoint = true;
        const deviation = effects[column] - observed[column];
        if (deviation === 0) statistic = 0;
        else {
          if (observedSE[column] === 0)
            throw new RangeError(
              'nonzero bootstrap deviation has no positive standard error'
            );
          statistic = deviation / observedSE[column];
          degenerateFallbacks++;
        }
      } else {
        statistic = (effects[column] - observed[column]) / sampledSE[column];
      }
      maxT = Math.max(maxT, Math.abs(statistic));
    }
    if (hasDegenerateEndpoint) degenerateResamples++;
    studentizedMax.push(maxT);
  }

  const familyCritical = percentile(studentizedMax, confidence);
  return {
    method: DECISION_INTERVAL_METHOD,
    strata: ordered,
    familyCount: width,
    resamples,
    confidence,
    observed,
    standardErrors: observedSE,
    familyCritical,
    degenerateResamples,
    degenerateFallbacks,
    intervals: distributions.map((values, column) => {
      const alpha = (1 - confidence) / 2;
      const halfWidth =
        observedSE[column] === 0 ? 0 : familyCritical * observedSE[column];
      return {
        lower: percentile(values, alpha),
        upper: percentile(values, 1 - alpha),
        oneSidedLower: observed[column] - halfWidth,
        oneSidedUpper: observed[column] + halfWidth,
        familyLower: observed[column] - halfWidth,
        familyUpper: observed[column] + halfWidth,
        familyCritical,
      };
    }),
  };
}

function compareRows(left, right) {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function columnMeans(rows, width) {
  const means = Array(width).fill(0);
  for (const row of rows)
    for (let column = 0; column < width; column++) means[column] += row[column];
  return means.map((sum) => sum / rows.length);
}

function standardErrorsForSample(stratumMeans, sampledRows, width) {
  return Array.from({ length: width }, (_, column) => {
    let variance = 0;
    for (let stratum = 0; stratum < sampledRows.length; stratum++) {
      const rows = sampledRows[stratum];
      const mean = stratumMeans[stratum][column];
      const within =
        rows.reduce((sum, row) => sum + (row[column] - mean) ** 2, 0) /
        Math.max(1, rows.length - 1);
      variance += within / rows.length;
    }
    return Math.sqrt(variance / stratumMeans.length ** 2);
  });
}

/** @param {number[]} x @param {number[]} y @return {{alpha: number, beta: number, r2: number, n: number}} */
export function linearRegression(x, y) {
  if (
    !Array.isArray(x) ||
    !Array.isArray(y) ||
    x.length !== y.length ||
    x.length < 2
  )
    throw new RangeError(
      'linear regression requires paired arrays of length at least two'
    );
  finiteValues(x);
  finiteValues(y);
  const xMean = x.reduce((sum, value) => sum + value, 0) / x.length;
  const yMean = y.reduce((sum, value) => sum + value, 0) / y.length;
  const ssX = x.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  if (ssX === 0)
    throw new RangeError('linear regression requires varying x values');
  const covariance = x.reduce(
    (sum, value, index) => sum + (value - xMean) * (y[index] - yMean),
    0
  );
  const beta = covariance / ssX;
  const alpha = yMean - beta * xMean;
  const ssY = y.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const residual = y.reduce(
    (sum, value, index) => sum + (value - (alpha + beta * x[index])) ** 2,
    0
  );
  return { alpha, beta, r2: ssY === 0 ? 1 : 1 - residual / ssY, n: x.length };
}

export function regression(x, y) {
  return linearRegression(x, y);
}

/** @param {number[]} values @param {number} familyCount */
export function familyAdjustedBounds(values, familyCount = 1) {
  const interval = ordinaryInterval(values);
  const z = normalQuantile(1 - 0.05 / Math.max(1, familyCount));
  const half = (z * interval.sd) / Math.sqrt(values.length);
  return {
    lower: interval.mean - half,
    upper: interval.mean + half,
    z,
    lowerRatio: Math.exp(interval.mean - half),
    upperRatio: Math.exp(interval.mean + half),
  };
}

/** Acklam's inverse-normal approximation, sufficient for benchmark intervals. */
function normalQuantile(p) {
  const a = [
    -39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269,
    -30.6647980661472, 2.50662827745924,
  ];
  const b = [
    -54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197,
    -13.2806815528857,
  ];
  const c = [
    -0.00778489400243029, -0.322396458041136, -2.40075827716184,
    -2.54973253934373, 4.37466414146497, 2.93816398269878,
  ];
  const d = [
    0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p <= 0 || p >= 1)
    throw new RangeError('normal quantile requires p in (0, 1)');
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    const numerator = horner(c, q);
    const denominator = horner([...d, 1], q);
    return numerator / denominator;
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    const numerator = horner(c, q);
    const denominator = horner([...d, 1], q);
    return -numerator / denominator;
  }
  const q = p - 0.5;
  const r = q * q;
  const numerator = horner(a, r) * q;
  const denominator = horner([...b, 1], r);
  return numerator / denominator;
}

/** @param {number[]} coefficients @param {number} value */
function horner(coefficients, value) {
  return coefficients.reduce(
    (result, coefficient) => result * value + coefficient,
    0
  );
}

/** @param {string} file @return {string} */
export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** @param {string} directory @return {string} */
export function sourceTreeHash(directory) {
  const files = [];
  function visit(current) {
    for (const name of readdirSync(current).sort()) {
      const file = join(current, name);
      const stat = statSync(file);
      if (stat.isDirectory()) visit(file);
      else files.push([relative(directory, file), readFileSync(file)]);
    }
  }
  visit(directory);
  return hashSourceFiles(files);
}

function hashSourceFiles(files) {
  const hash = createHash('sha256');
  for (const [name, data] of files)
    hash.update(name).update('\0').update(data).update('\0');
  return hash.digest('hex');
}

function benchmarkHarnessFiles(root) {
  const files = [];
  const scripts = join(root, 'scripts');
  const lib = join(scripts, 'lib');
  function addTree(directory, prefix) {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name);
      const stat = statSync(file);
      if (stat.isDirectory()) addTree(file, `${prefix}/${name}`);
      else files.push([`${prefix}/${name}`, readFileSync(file)]);
    }
  }
  addTree(lib, 'scripts/lib');
  for (const name of readdirSync(scripts).sort()) {
    if (!/^benchmark(?:-.+)?\.js$/.test(name) && !name.endsWith('worker.js'))
      continue;
    const file = join(scripts, name);
    if (statSync(file).isFile())
      files.push([`scripts/${name}`, readFileSync(file)]);
  }
  return files.sort(([a], [b]) => a.localeCompare(b));
}

export function benchmarkHarnessHash(root) {
  return hashSourceFiles(benchmarkHarnessFiles(root));
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function gitBuffer(root, args) {
  return execFileSync('git', args, { cwd: root });
}

function gitSourceTreeHash(root, ref) {
  const paths = git(root, ['ls-tree', '-r', '--name-only', ref, '--', 'src'])
    .split('\n')
    .filter(Boolean);
  return hashSourceFiles(
    paths.map((path) => [
      path.slice('src/'.length),
      gitBuffer(root, ['show', `${ref}:${path}`]),
    ])
  );
}

/** @param {string} root @param {string} baselineRef */
export function collectBenchmarkProvenance(
  root,
  {
    baselineRef = 'HEAD',
    benchmark = 'unknown',
    corpusPath,
    command = process.argv.join(' '),
  } = {}
) {
  const currentCommit = git(root, ['rev-parse', 'HEAD']);
  const baselineCommit = git(root, ['rev-parse', baselineRef]);
  const lockfile = join(root, 'pnpm-lock.yaml');
  let governor = null;
  try {
    governor = readFileSync(
      '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor',
      'utf8'
    ).trim();
  } catch {
    // Linux CPU governor is optional on other operating systems.
  }
  return {
    createdAt: new Date().toISOString(),
    command,
    benchmark,
    benchmarkHarnessHash: benchmarkHarnessHash(root),
    baselineCommit,
    worktreeCommit: currentCommit,
    baselineSourceHash: gitSourceTreeHash(root, baselineRef),
    worktreeSourceHash: sourceTreeHash(join(root, 'src')),
    baselineSourceTreeHash: gitSourceTreeHash(root, baselineRef),
    worktreeSourceTreeHash: sourceTreeHash(join(root, 'src')),
    sourceTreeHash: sourceTreeHash(join(root, 'src')),
    lockfileHash: sha256File(lockfile),
    corpusHash: corpusPath ? sha256File(corpusPath) : null,
    dirty: git(root, ['status', '--porcelain']) !== '',
    node: process.version,
    v8: process.versions.v8,
    cpu: cpus()[0]?.model ?? 'unknown',
    cpuCount: cpus().length,
    platform: `${platform()} ${release()} ${arch()}`,
    os: `${platform()} ${release()} ${arch()}`,
    loadAverage: loadavg(),
    linuxCpuGovernor: governor,
  };
}

export function collectEnvironment(root, baselineRef = 'HEAD') {
  return collectBenchmarkProvenance(root, { baselineRef });
}

/** @param {string} root @param {string} ref @return {{directory: string, sourceRoot: string, commit: string, cleanup: () => void}} */
export function materializeBaseline(root, ref) {
  // Keep the temporary tree below the project so ESM's normal package
  // resolution can reach the current checkout's installed dependencies.
  const directory = mkdtempSync(join(root, '.postcss-calc-baseline-'));
  mkdirSync(join(directory, 'src'), { recursive: true });
  try {
    const archive = execFileSync('git', ['archive', ref, '--', 'src'], {
      cwd: root,
    });
    execFileSync('tar', ['-x', '-f', '-', '-C', directory], { input: archive });
    return {
      directory,
      sourceRoot: join(directory, 'src'),
      commit: git(root, ['rev-parse', ref]),
      cleanup: () => rmSync(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

/** @param {string} worker @param {object} payload @param {string} cwd */
export function runChild(worker, payload, cwd) {
  const result = spawnSync(
    process.execPath,
    [worker, JSON.stringify(payload)],
    {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env },
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `benchmark child failed (${result.status}): ${result.stderr || result.stdout}`
    );
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `benchmark child returned invalid JSON: ${result.stdout.slice(0, 500)}`
    );
  }
}

/** @param {unknown} artifact @return {object} */
export function validateSchemaV2Artifact(artifact) {
  if (!artifact || typeof artifact !== 'object' || artifact.schema !== 2)
    throw new TypeError('artifact must use schema 2');
  if (
    typeof artifact.seed !== 'number' ||
    !Number.isInteger(artifact.seed) ||
    artifact.seed < 0 ||
    artifact.seed > 0xffffffff
  )
    throw new TypeError('artifact has an invalid seed');
  if (artifact.benchmark === 'corpus') return validateCorpusArtifact(artifact);
  if (!Array.isArray(artifact.blocks))
    throw new TypeError('artifact must contain blocks');
  const config =
    artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION
      ? validateDecisionConfig(artifact.config, 'parser artifact')
      : migrateLegacyDecisionConfig(artifact, 'parser');
  const requestedBlocks = config.requestedBlocks;
  const maxAttempts = config.maxAttempts;
  if (
    !Number.isInteger(requestedBlocks) ||
    requestedBlocks < MIN_VALID_BLOCKS ||
    requestedBlocks % 2 !== 0
  )
    throw new TypeError('artifact has an invalid requested block count');
  if (!Number.isInteger(maxAttempts) || maxAttempts < requestedBlocks)
    throw new TypeError('artifact has an invalid maxAttempts');
  const minimumBlocks = config.minimumBlocks;
  const underFloor = artifact.blocks.length < minimumBlocks;
  const isInconclusiveUnderfloorArtifact =
    underFloor &&
    artifact.analysis?.status === 'inconclusive' &&
    Array.isArray(artifact.attempts) &&
    artifact.attempts.length > 0;
  const isCorrectnessFailure =
    artifact.analysis?.status === 'correctness-failure';
  if (underFloor && !isInconclusiveUnderfloorArtifact && !isCorrectnessFailure)
    throw new TypeError(
      `artifact has fewer than ${minimumBlocks} valid blocks`
    );
  const expected = new Set(artifact.workloadKeys ?? []);
  if (expected.size === 0)
    throw new TypeError('artifact must contain workload keys');
  for (const [blockIndex, block] of artifact.blocks.entries())
    validateParserRecord(block, `block ${blockIndex}`, expected);
  if (artifact.attempts !== undefined) {
    if (!Array.isArray(artifact.attempts) || artifact.attempts.length === 0)
      throw new TypeError('artifact attempts must be a non-empty array');
    if (artifact.attempts.length > maxAttempts)
      throw new TypeError('artifact contains more attempts than maxAttempts');
    for (const [attemptIndex, attempt] of artifact.attempts.entries()) {
      validateParserRecord(
        attempt,
        `attempt ${attemptIndex}`,
        expected,
        true,
        config.driftThreshold
      );
      if (attempt.index !== attemptIndex)
        throw new TypeError(
          `attempt ${attemptIndex} has an inconsistent index`
        );
    }
    const accepted = artifact.attempts.filter((attempt) => !attempt.rejected);
    if (accepted.length !== artifact.blocks.length)
      throw new TypeError('artifact attempts and blocks are inconsistent');
    for (const [index, block] of artifact.blocks.entries()) {
      const attempt = accepted[index];
      if (JSON.stringify(attempt) !== JSON.stringify(block))
        throw new TypeError('artifact attempts and blocks are inconsistent');
    }
  } else if (underFloor) {
    throw new TypeError('under-floor artifact must retain attempts');
  }
  if (artifact.blocks.length > requestedBlocks)
    throw new TypeError('artifact contains more blocks than requested');
  if (artifact.blocks.length === requestedBlocks) {
    const orders = artifact.blocks.map((block) => block.processOrder);
    if (
      orders.filter((order) => order === 'baseline-first').length !==
      requestedBlocks / 2
    )
      throw new TypeError('accepted blocks have an unbalanced process order');
  }
  if (artifact.blocks.length >= minimumBlocks) {
    const orderCounts = {
      'baseline-first': artifact.blocks.filter(
        (block) => block.processOrder === 'baseline-first'
      ).length,
      'candidate-first': artifact.blocks.filter(
        (block) => block.processOrder === 'candidate-first'
      ).length,
    };
    if (orderCounts['baseline-first'] !== orderCounts['candidate-first'])
      throw new TypeError('accepted blocks have an unbalanced process order');
  }
  return artifact;
}

function validateParserRecord(
  record,
  label,
  expected,
  isAttempt = false,
  driftThreshold = 0.15
) {
  if (
    !record ||
    typeof record !== 'object' ||
    !['baseline-first', 'candidate-first'].includes(record.processOrder)
  )
    throw new TypeError(`${label} has an invalid process order`);
  if (
    !Number.isInteger(record.seed) ||
    record.seed < 0 ||
    record.seed > 0xffffffff
  )
    throw new TypeError(`${label} has an invalid seed`);
  if (isAttempt && !Number.isInteger(record.index))
    throw new TypeError(`${label} has an invalid index`);
  if (
    !Array.isArray(record.workloadOrder) ||
    record.workloadOrder.length !== expected.size ||
    new Set(record.workloadOrder).size !== expected.size ||
    record.workloadOrder.some((key) => !expected.has(key))
  )
    throw new TypeError(`${label} has mismatched workload keys`);
  if (!Array.isArray(record.revisions) || record.revisions.length !== 2)
    throw new TypeError(`${label} must contain two revisions`);
  const revisions = new Set(
    record.revisions.map((revision) => revision?.revision)
  );
  if (
    revisions.size !== 2 ||
    !revisions.has('baseline') ||
    !revisions.has('candidate')
  )
    throw new TypeError(`${label} must contain baseline and candidate`);
  if (isAttempt) {
    if (typeof record.rejected !== 'boolean')
      throw new TypeError(`${label} has an invalid rejection flag`);
    if (
      !Array.isArray(record.rejectionReasons) ||
      record.rejectionReasons.some(
        (reason) => !['drift', 'structural-mismatch'].includes(reason)
      ) ||
      new Set(record.rejectionReasons).size !==
        record.rejectionReasons.length ||
      record.rejected !== Boolean(record.rejectionReasons.length) ||
      record.rejectionReason !== (record.rejectionReasons.join('+') || null)
    )
      throw new TypeError(`${label} has an invalid rejection reason`);
    if (
      !Array.isArray(record.drift) ||
      record.drift.length !== 2 ||
      record.drift.some(
        (value) =>
          typeof value !== 'number' || !Number.isFinite(value) || value < 0
      )
    )
      throw new TypeError(`${label} has invalid drift`);
    if (
      !Array.isArray(record.structuralMismatches) ||
      record.structuralMismatches.some((key) => typeof key !== 'string')
    )
      throw new TypeError(`${label} has invalid structural mismatches`);
    if (
      Boolean(record.structuralMismatches.length) !==
      record.rejectionReasons.includes('structural-mismatch')
    )
      throw new TypeError(`${label} has inconsistent structural rejection`);
    if (
      record.drift.some((value) => value > driftThreshold) !==
      record.rejectionReasons.includes('drift')
    )
      throw new TypeError(`${label} has inconsistent drift rejection`);
  }
  for (const revision of record.revisions)
    validateParserRevision(revision, label, expected, record.processOrder);
  if (isAttempt) {
    const expectedDrift = record.revisions.map((revision) =>
      Math.abs(
        revision.controlAfter.medianMs / revision.controlBefore.medianMs - 1
      )
    );
    if (
      record.drift.some(
        (value, index) => Math.abs(value - expectedDrift[index]) > 1e-12
      )
    )
      throw new TypeError(`${label} has inconsistent drift`);
    const structural = new Map(
      record.revisions.flatMap((revision) =>
        revision.workloads.map((workload) => [
          `${revision.revision}:${workload.key}`,
          workload.structural,
        ])
      )
    );
    const mismatches = [...expected].filter(
      (key) =>
        structural.get(`baseline:${key}`) !== structural.get(`candidate:${key}`)
    );
    if (
      JSON.stringify(mismatches) !== JSON.stringify(record.structuralMismatches)
    )
      throw new TypeError(`${label} has inconsistent structural mismatches`);
  }
}

function validateParserRevision(revision, label, expected, processOrder) {
  if (!revision || !['baseline', 'candidate'].includes(revision.revision))
    throw new TypeError(`${label} has invalid revisions`);
  if (
    !['baseline-first', 'candidate-first'].includes(revision.processOrder) ||
    revision.processOrder !== processOrder
  )
    throw new TypeError(`${label} has invalid revision process order`);
  validateControl(revision.controlBefore, `${label} controlBefore`);
  validateControl(revision.controlAfter, `${label} controlAfter`);
  if (!Array.isArray(revision.workloads))
    throw new TypeError(`${label} has invalid workloads`);
  const seen = new Set();
  for (const workload of revision.workloads) {
    if (
      !workload ||
      typeof workload.key !== 'string' ||
      !expected.has(workload.key) ||
      seen.has(workload.key)
    )
      throw new TypeError(`${label} has mismatched workload keys`);
    seen.add(workload.key);
    validateParserWorkload(workload, `${label} ${workload.key}`);
  }
  if (seen.size !== expected.size)
    throw new TypeError(`${label} has missing workload keys`);
}

function validateControl(control, label) {
  if (
    !control ||
    typeof control !== 'object' ||
    !positiveFinite(control.medianMs) ||
    !Array.isArray(control.samplesMs) ||
    control.samplesMs.length === 0 ||
    control.samplesMs.some((value) => !positiveFinite(value))
  )
    throw new TypeError(`${label} has invalid timings`);
}

function validateParserWorkload(workload, label) {
  if (!Number.isInteger(workload.repetitions) || workload.repetitions <= 0)
    throw new TypeError(`${label} has invalid repetitions`);
  for (const [name, values] of [
    ['calibrationSamplesMs', workload.calibrationSamplesMs],
    ['warmups', workload.warmups],
    ['warmupElapsedMs', workload.warmupElapsedMs],
    ['measured', workload.measured],
    ['measuredElapsedMs', workload.measuredElapsedMs],
  ]) {
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.some((value) => !positiveFinite(value))
    )
      throw new TypeError(
        `${label} has ${
          name === 'measured' || name === 'warmups'
            ? 'nonpositive timings'
            : `invalid ${name}`
        }`
      );
  }
  if (
    workload.warmups.length !== workload.warmupElapsedMs.length ||
    workload.measured.length !== workload.measuredElapsedMs.length
  )
    throw new TypeError(`${label} has inconsistent elapsed timings`);
  if (
    typeof workload.structural !== 'string' ||
    !workload.structural ||
    workload.checksum !== workload.structural ||
    !Number.isInteger(workload.consumed) ||
    workload.consumed < 0
  )
    throw new TypeError(`${label} has invalid structural digest or checksum`);
}

function positiveFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validateCorpusArtifact(artifact) {
  if (
    !Array.isArray(artifact.replicates) ||
    artifact.replicates.length < MIN_VALID_BLOCKS
  )
    throw new TypeError('corpus artifact has insufficient valid replicates');
  const config =
    artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION
      ? validateDecisionConfig(artifact.config, 'corpus artifact')
      : migrateLegacyDecisionConfig(artifact, 'corpus');
  if (
    (config.replicates ?? artifact.replicates.length) !==
      artifact.replicates.length ||
    (config.batches ?? 6) !== 6
  )
    throw new TypeError(
      'corpus artifact has inconsistent replicate configuration'
    );
  if (artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION)
    validateCorpusCorrectness(artifact);
  else if (
    !artifact.correctness ||
    !Number.isInteger(artifact.correctness.accepted) ||
    artifact.correctness.accepted <= 0
  )
    throw new TypeError('corpus artifact has invalid correctness metadata');
  const expectedGroups = corpusGroups(artifact);
  if (expectedGroups.length < 2)
    throw new TypeError('corpus artifact has no complete comparison groups');
  const repetitionsByGroup = new Map();
  const checksumsByGroup = new Map();
  const allChecksumsByGroup = new Map();
  const replicateIds = new Set();
  for (const [index, replicate] of artifact.replicates.entries()) {
    if (
      !Number.isInteger(replicate?.replicate) ||
      replicate.replicate < 0 ||
      replicateIds.has(replicate.replicate)
    )
      throw new TypeError(`corpus replicate ${index} has an invalid id`);
    replicateIds.add(replicate.replicate);
    if (config.calibrationOrderBalanced === true) {
      if (
        !['ours-first', 'reference-first'].includes(replicate.calibrationOrder)
      )
        throw new TypeError(
          `corpus replicate ${index} has an invalid calibration order`
        );
      for (const expectedOrder of ['ours-first', 'reference-first']) {
        const count = artifact.replicates.filter(
          (item) => item.calibrationOrder === expectedOrder
        ).length;
        if (Math.abs(count - artifact.replicates.length / 2) > 1)
          throw new TypeError('corpus calibration orders are unbalanced');
      }
    }
    if (
      !Array.isArray(replicate.permutation) ||
      !isPermutation(replicate.permutation, artifact.correctness.accepted)
    )
      throw new TypeError(
        `corpus replicate ${index} has an invalid permutation`
      );
    if (!Array.isArray(replicate.batches) || replicate.batches.length !== 6)
      throw new TypeError(`corpus replicate ${index} must contain six batches`);
    const orderCounts = { 'ours-first': 0, 'reference-first': 0 };
    for (const [batchIndex, batch] of replicate.batches.entries()) {
      if (
        !batch ||
        !['ours-first', 'reference-first'].includes(batch.order) ||
        !Array.isArray(batch.measurements)
      )
        throw new TypeError(
          `corpus replicate ${index} has invalid batch order`
        );
      orderCounts[batch.order]++;
      const seenGroups = new Set();
      if (batch.measurements.length !== expectedGroups.length)
        throw new TypeError(
          `corpus replicate ${index} batch ${batchIndex} has incomplete groups`
        );
      for (const measurement of batch.measurements) {
        if (
          !measurement ||
          typeof measurement.group !== 'string' ||
          !expectedGroups.includes(measurement.group) ||
          seenGroups.has(measurement.group)
        )
          throw new TypeError(
            `corpus replicate ${index} batch ${batchIndex} has invalid groups`
          );
        seenGroups.add(measurement.group);
        if (
          !Number.isInteger(measurement.repetitions) ||
          measurement.repetitions <= 0
        )
          throw new TypeError(
            `corpus replicate ${index} has invalid repetitions`
          );
        const replicateGroup = `${replicate.replicate}:${measurement.group}`;
        const previousRepetitions = repetitionsByGroup.get(replicateGroup);
        if (
          previousRepetitions !== undefined &&
          previousRepetitions !== measurement.repetitions
        )
          throw new TypeError(
            `corpus group ${measurement.group} has inconsistent repetitions`
          );
        repetitionsByGroup.set(replicateGroup, measurement.repetitions);
        if (
          !Array.isArray(measurement.calibrationSamplesMs) ||
          measurement.calibrationSamplesMs.length === 0
        )
          throw new TypeError(
            `corpus replicate ${index} has invalid calibration samples`
          );
        for (const sample of measurement.calibrationSamplesMs) {
          if (
            !sample ||
            !positiveFinite(sample.oursMs) ||
            !positiveFinite(sample.referenceMs)
          )
            throw new TypeError(
              `corpus replicate ${index} has invalid calibration timings`
            );
        }
        if (
          config.calibrationOrderBalanced === true &&
          measurement.calibrationOrder !== replicate.calibrationOrder
        )
          throw new TypeError(
            `corpus replicate ${index} has an inconsistent calibration order`
          );
        for (const implementation of ['ours', 'reference']) {
          const result = measurement[implementation];
          if (
            !result ||
            !positiveFinite(result.ms) ||
            !positiveFinite(result.elapsedMs) ||
            !Number.isInteger(result.checksum) ||
            result.checksum < 0
          )
            throw new TypeError(
              `corpus replicate ${index} has nonpositive timings`
            );
          const checksumKey = `${replicate.replicate}:${measurement.group}:${implementation}`;
          const previousChecksum = checksumsByGroup.get(checksumKey);
          if (
            previousChecksum !== undefined &&
            previousChecksum !== result.checksum
          )
            throw new TypeError(
              `corpus group ${measurement.group} has inconsistent checksums`
            );
          checksumsByGroup.set(checksumKey, result.checksum);
          const allChecksums =
            allChecksumsByGroup.get(measurement.group) ?? new Set();
          allChecksums.add(result.checksum);
          allChecksumsByGroup.set(measurement.group, allChecksums);
        }
      }
      if (seenGroups.size !== expectedGroups.length)
        throw new TypeError(
          `corpus replicate ${index} batch ${batchIndex} has missing groups`
        );
    }
    if (orderCounts['ours-first'] !== 3 || orderCounts['reference-first'] !== 3)
      throw new TypeError(
        `corpus replicate ${index} has unbalanced process orders`
      );
  }
  validateCorpusGroupSummaries(artifact, expectedGroups, allChecksumsByGroup);
  return artifact;
}

function validateCorpusCorrectness(artifact) {
  const correctness = artifact.correctness;
  if (
    !correctness ||
    !Number.isInteger(correctness.accepted) ||
    correctness.accepted <= 0
  )
    throw new TypeError('corpus artifact has invalid correctness metadata');
  if (!correctness.counts || !correctness.categoryHashes)
    throw new TypeError('corpus artifact is missing corpus category metadata');
  for (const category of CORPUS_CATEGORIES) {
    if (
      !Number.isInteger(correctness.counts[category]) ||
      correctness.counts[category] < 0
    )
      throw new TypeError(`corpus artifact has invalid ${category} count`);
    if (typeof correctness.categoryHashes[category] !== 'string')
      throw new TypeError(`corpus artifact has invalid ${category} hash`);
    if (
      category !== 'accepted' &&
      !NEUTRAL_CORPUS_CATEGORIES.has(category) &&
      correctness.counts[category] !== 0
    )
      throw new TypeError(
        `corpus artifact contains non-neutral ${category} inputs`
      );
  }
  if (correctness.counts.accepted !== correctness.accepted)
    throw new TypeError('corpus artifact has inconsistent accepted counts');
  if (
    typeof correctness.inputHash !== 'string' ||
    correctness.inputHash.length === 0
  )
    throw new TypeError('corpus artifact has an invalid input hash');
}

function corpusGroups(artifact) {
  const strata = artifact.corpus?.lengthStrata;
  const shapes = artifact.corpus?.rootShapeCounts;
  if (
    !strata ||
    !shapes ||
    typeof strata !== 'object' ||
    typeof shapes !== 'object'
  )
    throw new TypeError('corpus artifact is missing group metadata');
  const groups = ['exact'];
  for (const [group, count] of Object.entries(shapes).sort())
    if (Number.isInteger(count) && count > 0) groups.push(group);
  for (const [group, count] of Object.entries(strata).sort())
    if (Number.isInteger(count) && count > 0) groups.push(group);
  return groups;
}

function isPermutation(values, length) {
  return (
    Number.isInteger(length) &&
    Array.isArray(values) &&
    values.length === length &&
    values.every(
      (value) => Number.isInteger(value) && value >= 0 && value < length
    ) &&
    new Set(values).size === length
  );
}

function validateCorpusGroupSummaries(
  artifact,
  expectedGroups,
  allChecksumsByGroup
) {
  const groups = artifact.analysis?.groups;
  if (artifact.analysis === undefined) return;
  if (!groups || typeof groups !== 'object' || Array.isArray(groups))
    throw new TypeError('corpus artifact is missing group summaries');
  const names = Object.keys(groups).sort();
  if (JSON.stringify(names) !== JSON.stringify([...expectedGroups].sort()))
    throw new TypeError('corpus artifact has incomplete group summaries');
  for (const group of expectedGroups) {
    const summary = groups[group];
    const rawRatios = corpusRawRatios(artifact, group);
    if (
      !summary ||
      summary.replicates !== artifact.replicates.length ||
      !Array.isArray(summary.ratios) ||
      summary.ratios.length !== artifact.replicates.length ||
      summary.ratios.some((ratio) => !positiveFinite(ratio)) ||
      !Array.isArray(summary.checksums) ||
      summary.checksums.length === 0 ||
      summary.checksums.some(
        (checksum) => !Number.isInteger(checksum) || checksum < 0
      )
    )
      throw new TypeError(`corpus group ${group} has invalid summary`);
    if (
      rawRatios.length !== summary.ratios.length ||
      rawRatios.some(
        (ratio, index) => Math.abs(ratio - summary.ratios[index]) > 1e-12
      )
    )
      throw new TypeError(
        `corpus group ${group} summary is not derived from raw observations`
      );
    const rawLogs = rawRatios.map(Math.log);
    const rawMean =
      rawLogs.reduce((sum, value) => sum + value, 0) / rawLogs.length;
    if (
      summary.geometricMeanPairedRuntimeRatio !== undefined &&
      Math.abs(summary.geometricMeanPairedRuntimeRatio - Math.exp(rawMean)) >
        1e-12
    )
      throw new TypeError(
        `corpus group ${group} summary mean is not derived from raw observations`
      );
    if (summary.bootstrap95) {
      const digest = createHash('sha256').update(group).digest('hex');
      const groupSeed =
        (artifact.seed ^ Number.parseInt(digest.slice(0, 8), 16)) >>> 0;
      const expectedBootstrap = bootstrapCorpusInterval(
        corpusRawReplicatePairs(artifact, group),
        groupSeed,
        artifact.config?.bootstrapResamples ?? BOOTSTRAP_RESAMPLES,
        0.95
      );
      if (
        Math.abs(
          summary.bootstrap95.lowerRatio - Math.exp(expectedBootstrap.lower)
        ) > 1e-12 ||
        Math.abs(
          summary.bootstrap95.upperRatio - Math.exp(expectedBootstrap.upper)
        ) > 1e-12
      )
        throw new TypeError(
          `corpus group ${group} interval is not derived from raw observations`
        );
      if (summary.bootstrap90) {
        const expectedNinety = bootstrapCorpusInterval(
          corpusRawReplicatePairs(artifact, group),
          (groupSeed ^ 0x9e3779b9) >>> 0,
          artifact.config?.bootstrapResamples ?? BOOTSTRAP_RESAMPLES,
          0.9
        );
        if (
          Math.abs(
            summary.bootstrap90.lowerRatio - Math.exp(expectedNinety.lower)
          ) > 1e-12 ||
          Math.abs(
            summary.bootstrap90.upperRatio - Math.exp(expectedNinety.upper)
          ) > 1e-12
        )
          throw new TypeError(
            `corpus group ${group} practical interval is not derived from raw observations`
          );
      }
    }
    const expectedChecksums = allChecksumsByGroup.get(group) ?? new Set();
    if (
      summary.checksums.length !== expectedChecksums.size ||
      summary.checksums.some((checksum) => !expectedChecksums.has(checksum))
    )
      throw new TypeError(`corpus group ${group} has inconsistent checksums`);
  }
  if (artifact.analysis?.status) {
    if (
      !['postcss-calc faster', 'postcss-calc slower', 'inconclusive'].includes(
        artifact.analysis.status
      )
    )
      throw new TypeError('corpus artifact has an invalid statistical status');
    if (
      artifact.analysis.statistical?.status !== undefined &&
      artifact.analysis.statistical.status !== artifact.analysis.status
    )
      throw new TypeError(
        'corpus artifact has inconsistent statistical status'
      );
    if (
      artifact.analysis.practical?.margin !== undefined &&
      artifact.analysis.practical.margin !== artifact.config.equivalenceMargin
    )
      throw new TypeError(
        'corpus artifact has inconsistent equivalence margin'
      );
  }
}

function corpusRawRatios(artifact, group) {
  return corpusRawReplicatePairs(artifact, group).map(
    ([oursFirst, referenceFirst]) =>
      Math.exp((Math.log(oursFirst) + Math.log(referenceFirst)) / 2)
  );
}

function corpusRawReplicatePairs(artifact, group) {
  return artifact.replicates.map((replicate) =>
    ['ours-first', 'reference-first'].map((order) => {
      const values = replicate.batches
        .filter((batch) => batch.order === order)
        .map((batch) =>
          batch.measurements.find((item) => item.group === group)
        );
      return (
        median(values.map((value) => value.ours.ms)) /
        median(values.map((value) => value.reference.ms))
      );
    })
  );
}

function bootstrapCorpusInterval(strata, seed, resamples, confidence) {
  if (!Array.isArray(strata) || strata.length === 0)
    throw new RangeError('cannot bootstrap an empty replicate set');
  if (strata.some((pair) => !Array.isArray(pair) || pair.length !== 2))
    throw new TypeError(
      'each corpus replicate must contain both order results'
    );
  const random = seededRandom(seed);
  const means = Array.from({ length: resamples }, () => 0);
  for (let sample = 0; sample < resamples; sample++) {
    for (let index = 0; index < strata.length; index++) {
      const [oursFirst, referenceFirst] =
        strata[Math.floor(random() * strata.length)];
      means[sample] +=
        (Math.log(oursFirst) + Math.log(referenceFirst)) / (2 * strata.length);
    }
  }
  const alpha = (1 - confidence) / 2;
  return {
    lower: percentile(means, alpha),
    upper: percentile(means, 1 - alpha),
  };
}

export { normalQuantile };
