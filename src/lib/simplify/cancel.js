import { baseOf, convert } from '../convertUnits.js';
import { isExact } from './exact.js';

/**
 * If `dims` contain exactly one numerator / one denominator pair with the
 * same base type and convertible units, return the two sides expressed in a
 * common unit, so the caller can fold them into its own numerator and
 * denominator. Otherwise return null. Used by `simplifyProduct` for typed
 * division (§10.2). More complex cancellation (e.g. `px^2 / px`) is left
 * unreduced — consumers rarely rely on it and the spec doesn't require it.
 * @template {{ exponent: 1 | -1, value: number, unit: string }} D
 * @param {D[]} dims
 * @param {number | false} [precision] The denominator is converted into the
 *   numerator's unit when that is exact at this precision (`1px / 1in` →
 *   `1 / 96`); otherwise the numerator is converted (`1in / 1px` → `96 / 1`).
 * @return {{ numerator: number, denominator: number, remaining: D[] } | null}
 */
function tryCancelPair(dims, precision = false) {
  if (dims.length !== 2) {
    return null;
  }
  const [a, b] = /** @type {[D, D]} */ (dims);
  if (a.exponent === b.exponent) {
    return null;
  }
  const numerator = a.exponent === 1 ? a : b;
  const denominator = a.exponent === 1 ? b : a;
  const numBase = baseOf(numerator.unit);
  const denBase = baseOf(denominator.unit);
  if (!numBase || numBase !== denBase) {
    return null;
  }
  const converted = convert(
    denominator.value,
    denominator.unit,
    numerator.unit
  );
  // denominator.value === 0 yields ±Infinity / NaN naturally (§10.9.1).
  if (converted !== null && isExact(converted, precision)) {
    return {
      numerator: numerator.value,
      denominator: converted,
      remaining: [],
    };
  }
  const numConverted = convert(
    numerator.value,
    numerator.unit,
    denominator.unit
  );
  if (numConverted !== null && isExact(numConverted, precision)) {
    return {
      numerator: numConverted,
      denominator: denominator.value,
      remaining: [],
    };
  }
  return null;
}

export { tryCancelPair };
