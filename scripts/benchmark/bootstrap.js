/* oxlint-disable complexity */
import { BOOTSTRAP_RESAMPLES, DECISION_INTERVAL_METHOD } from './config.js';
import { seededRandom } from './random.js';
import { finiteValues, percentile } from './statistics.js';

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
  const distributions = Array.from(
    { length: width },
    () => new Float64Array(resamples)
  );
  const studentizedMax = new Float64Array(resamples);
  const strataCount = strataRows.length;
  const sampledIndices = strataRows.map(
    (group) => new Int32Array(group.length)
  );
  const sampledMeans = strataRows.map(() => new Float64Array(width));
  let degenerateResamples = 0;
  let degenerateFallbacks = 0;
  const random = seededRandom(seed);

  for (let sample = 0; sample < resamples; sample++) {
    for (let stratum = 0; stratum < strataCount; stratum++) {
      const group = strataRows[stratum];
      const indices = sampledIndices[stratum];
      const means = sampledMeans[stratum];
      means.fill(0);
      for (let i = 0; i < group.length; i++) {
        const index = Math.floor(random() * group.length);
        indices[i] = index;
        const row = group[index];
        for (let column = 0; column < width; column++)
          means[column] += row[column];
      }
      for (let column = 0; column < width; column++)
        means[column] /= group.length;
    }
    let maxT = 0;
    let hasDegenerateEndpoint = false;
    for (let column = 0; column < width; column++) {
      let effect = 0;
      let variance = 0;
      for (let stratum = 0; stratum < strataCount; stratum++) {
        const group = strataRows[stratum];
        const indices = sampledIndices[stratum];
        const mean = sampledMeans[stratum][column];
        effect += mean;
        let within = 0;
        for (let i = 0; i < indices.length; i++)
          within += (group[indices[i]][column] - mean) ** 2;
        variance += within / Math.max(1, group.length - 1) / group.length;
      }
      effect /= strataCount;
      const sampledSE = Math.sqrt(variance / strataCount ** 2);
      distributions[column][sample] = effect;
      let statistic;
      if (sampledSE === 0) {
        hasDegenerateEndpoint = true;
        const deviation = effect - observed[column];
        if (deviation === 0) {
          statistic = 0;
        } else if (observedSE[column] === 0) {
          throw new RangeError(
            'nonzero bootstrap deviation has no positive standard error'
          );
        } else {
          statistic = deviation / observedSE[column];
          degenerateFallbacks++;
        }
      } else {
        statistic = (effect - observed[column]) / sampledSE;
      }
      maxT = Math.max(maxT, Math.abs(statistic));
    }
    if (hasDegenerateEndpoint) degenerateResamples++;
    studentizedMax[sample] = maxT;
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

/**
 * Bootstrap the mean of paired log-ratios, resampling whole replicates.
 *
 * @param {number[][]} pairs [first-order, second-order] log-ratios per replicate
 * @param {number} seed
 * @param {number} resamples
 * @param {number} confidence
 */
export function bootstrapPairedReplicateInterval(
  pairs,
  seed,
  resamples,
  confidence
) {
  if (!Array.isArray(pairs) || pairs.length === 0)
    throw new RangeError('cannot bootstrap an empty replicate set');
  if (pairs.some((pair) => !Array.isArray(pair) || pair.length !== 2))
    throw new TypeError(
      'each corpus replicate must contain both order results'
    );
  const random = seededRandom(seed);
  const means = new Float64Array(resamples);
  for (let sample = 0; sample < resamples; sample++) {
    for (let index = 0; index < pairs.length; index++) {
      const pair = pairs[Math.floor(random() * pairs.length)];
      means[sample] += (pair[0] + pair[1]) / (2 * pairs.length);
    }
  }
  const alpha = (1 - confidence) / 2;
  return {
    lower: percentile(means, alpha),
    upper: percentile(means, 1 - alpha),
    resamples,
  };
}

/**
 * Same as {@link bootstrapPairedReplicateInterval} for raw runtime ratios;
 * the logarithms are computed once rather than once per resample.
 *
 * @param {number[][]} strata
 */
export function bootstrapCorpusInterval(strata, seed, resamples, confidence) {
  const pairs = Array.isArray(strata)
    ? strata.map((pair) =>
        Array.isArray(pair) && pair.length === 2 ? pair.map(Math.log) : pair
      )
    : strata;
  return bootstrapPairedReplicateInterval(pairs, seed, resamples, confidence);
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
