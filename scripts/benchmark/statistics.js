/** @param {number[] | Float64Array} values @return {number[] | Float64Array} */
export function finiteValues(values) {
  if (
    (!Array.isArray(values) && !ArrayBuffer.isView(values)) ||
    values.length === 0
  )
    throw new RangeError('expected a non-empty numeric array');
  if (
    values.some((value) => typeof value !== 'number' || !Number.isFinite(value))
  )
    throw new TypeError('values must be finite numbers');
  return values;
}

/** @param {number[] | Float64Array} values @return {number} */
export function median(values) {
  const finite = finiteValues(values);
  const sorted = ArrayBuffer.isView(finite)
    ? finite.slice().sort()
    : [...finite].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** @param {number[] | Float64Array} values @param {number} p @return {number} */
export function percentile(values, p) {
  const finite = finiteValues(values);
  const sorted = ArrayBuffer.isView(finite)
    ? finite.slice().sort()
    : [...finite].sort((a, b) => a - b);
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

/** Acklam's inverse-normal approximation, sufficient for benchmark intervals. */
export function normalQuantile(p) {
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
