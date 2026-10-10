import { mkProduct, num, dim } from '../node.js';
import { isExact } from './exact.js';

/**
 * @typedef {import('../node.js').Node} Node
 * @typedef {import('../node.js').ProductFactor} ProductFactor
 */

/**
 * @param {number} a non-negative
 * @param {number} b non-negative
 * @return {number}
 */
function gcd(a, b) {
  let x = a;
  let y = b;
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

/**
 * @param {{exponent: 1 | -1, value: number}[]} chain
 * @return {number}
 */
function chainValue(chain) {
  let value = 1;
  for (const f of chain) {
    value = f.exponent === 1 ? value * f.value : value / f.value;
  }
  return value;
}

/**
 * Whether the opaque factors are a single Sum of only Num/Dim terms.
 * @param {ProductFactor[]} opaque
 * @return {boolean}
 */
function isScalarSum(opaque) {
  return (
    opaque.length === 1 &&
    opaque[0].exponent === 1 &&
    opaque[0].node.type === 'Sum' &&
    opaque[0].node.terms.every(
      (t) => t.node.type === 'Num' || t.node.type === 'Dim'
    )
  );
}

/**
 * Whether a folded quotient prints exactly. A quotient distributed over a
 * scalar Sum is judged term by term, so `(3px + 6em) / 3` still folds.
 * @param {number} value
 * @param {ProductFactor[]} opaque
 * @param {boolean} distributable
 * @param {number | false} precision
 * @return {boolean}
 */
function foldsExactly(value, opaque, distributable, precision) {
  if (!Number.isFinite(value) || isExact(value, precision)) {
    return true;
  }
  if (!distributable) {
    return false;
  }
  const sum = /** @type {import('../node.js').Sum} */ (opaque[0].node);
  return sum.terms.every((t) =>
    isExact(
      value *
        /** @type {import('../node.js').Num | import('../node.js').Dim} */ (
          t.node
        ).value,
      precision
    )
  );
}

/**
 * Emit an inexact quotient as `numerator * dims * opaque / denominator`, with
 * integer parts reduced by their gcd. A lone Dim absorbs the numerator.
 * @param {number} numerator
 * @param {number} denominator
 * @param {{value: number, unit: string, rawUnit?: string} | null} loneDim
 * @param {{exponent: 1 | -1, value: number, unit: string, rawUnit?: string}[]} dims
 * @param {ProductFactor[]} opaque
 * @param {number | false} precision
 * @return {Node | null} null when a part would be rounded on output
 */
function rationalProduct(
  numerator,
  denominator,
  loneDim,
  dims,
  opaque,
  precision
) {
  // Drop float noise (`1.9999999999999993 * 100`) so the parts print as
  // written and the gcd below can reduce them.
  let n = Number(
    (loneDim === null ? numerator : numerator * loneDim.value).toPrecision(15)
  );
  let d = Number(denominator.toPrecision(15));
  if (!isExact(n, precision) || !isExact(d, precision)) {
    return null;
  }
  if (Number.isSafeInteger(n) && Number.isSafeInteger(d)) {
    const g = gcd(Math.abs(n), Math.abs(d));
    n /= g;
    d /= g;
  }
  if (d < 0) {
    n = -n;
    d = -d;
  }
  /** @type {ProductFactor[]} */
  const factors = [];
  if (loneDim !== null) {
    factors.push({
      exponent: 1,
      node: dim(n, loneDim.unit, loneDim.rawUnit),
    });
  } else {
    if (n !== 1) {
      factors.push({ exponent: 1, node: num(n) });
    }
    for (const dm of dims) {
      factors.push({
        exponent: dm.exponent,
        node: dim(dm.value, dm.unit, dm.rawUnit),
      });
    }
  }
  factors.push(...opaque);
  if (d !== 1) {
    factors.push({ exponent: -1, node: num(d) });
  }
  return mkProduct(factors);
}

export { chainValue, foldsExactly, isScalarSum, rationalProduct };
