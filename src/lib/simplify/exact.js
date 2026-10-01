import { round } from '../serialize/precision.js';

/**
 * A value is exact at `precision` when rounding it for output loses nothing
 * beyond float noise.
 * @param {number} value
 * @param {number | false} precision
 * @return {boolean}
 */
function isExact(value, precision) {
  if (precision === false || !Number.isFinite(value)) {
    return true;
  }
  const snapped = Number(value.toPrecision(15));
  return round(snapped, precision) === snapped;
}

export { isExact };
