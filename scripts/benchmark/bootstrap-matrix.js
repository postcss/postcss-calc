import { seededRandom } from './random.js';
import { finiteValues } from './statistics.js';

export function matrixWidth(rows) {
  const width = rows[0]?.length;
  if (!Number.isInteger(width) || width <= 0)
    throw new RangeError('cannot bootstrap a matrix without columns');
  return width;
}

export function validateRows(rows, width) {
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== width)
      throw new TypeError('bootstrap rows must have equal widths');
    finiteValues(row);
  }
}

export function columnMeans(rows, width) {
  const means = Array(width).fill(0);
  for (const row of rows)
    for (let column = 0; column < width; column++) means[column] += row[column];
  return means.map((sum) => sum / rows.length);
}

export function resampleRows(
  rows,
  width,
  resamples,
  seed,
  observed,
  standardErrors
) {
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
      const deviation = pairedDeviation(
        mean,
        observed[column],
        standardErrors[column]
      );
      maxDeviation = Math.max(maxDeviation, deviation);
    }
    studentizedDeviations[sample] = maxDeviation;
  }
  return { distributions, studentizedDeviations };
}

export function pairedDeviation(mean, observed, standardError) {
  if (standardError !== 0) return Math.abs((mean - observed) / standardError);
  return mean === observed ? 0 : Infinity;
}

export function splitStrata(rows, strata) {
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
  return { ordered, strataRows };
}

export function resampleStratum(group, indices, means, width, random) {
  means.fill(0);
  for (let i = 0; i < group.length; i++) {
    const index = Math.floor(random() * group.length);
    indices[i] = index;
    const row = group[index];
    for (let column = 0; column < width; column++) means[column] += row[column];
  }
  for (let column = 0; column < width; column++) means[column] /= group.length;
}

export function sampledEffect(sampledMeans, column) {
  let effect = 0;
  for (const means of sampledMeans) effect += means[column];
  return effect / sampledMeans.length;
}

export function sampledVariance(
  strataRows,
  sampledIndices,
  sampledMeans,
  column
) {
  let variance = 0;
  for (let stratum = 0; stratum < strataRows.length; stratum++) {
    const group = strataRows[stratum];
    const indices = sampledIndices[stratum];
    const mean = sampledMeans[stratum][column];
    let within = 0;
    for (let i = 0; i < indices.length; i++)
      within += (group[indices[i]][column] - mean) ** 2;
    variance += within / Math.max(1, group.length - 1) / group.length;
  }
  return variance;
}

export function studentizedStatistic(
  deviation,
  sampledSE,
  observedSE,
  counters
) {
  if (sampledSE !== 0) return deviation / sampledSE;
  counters.degenerateEndpoint = true;
  if (deviation === 0) return 0;
  if (observedSE === 0)
    throw new RangeError(
      'nonzero bootstrap deviation has no positive standard error'
    );
  counters.degenerateFallbacks++;
  return deviation / observedSE;
}

export function standardErrorsForSample(stratumMeans, sampledRows, width) {
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

function compareRows(left, right) {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}
