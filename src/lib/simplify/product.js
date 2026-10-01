import { mkSum, mkProduct, mkGroup, num, dim } from '../node.js';
import { tryCancelPair } from './cancel.js';
import { isExact } from './exact.js';

/**
 * @typedef {import('../node.js').Node} Node
 * @typedef {import('../node.js').Product} Product
 * @typedef {import('../node.js').ProductFactor} ProductFactor
 * @typedef {import('../simplify.js').SimplifyFn} SimplifyFn
 */

/**
 * @param {number} a non-negative
 * @param {number} b non-negative
 * @return {number}
 */
function gcd(a, b) {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
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

/**
 * Fold a run of factors that contains no substitution barrier.
 * @param {ProductFactor[]} items Simplified factors, flattened by the caller.
 * @param {number} start
 * @param {number} end
 * @param {SimplifyFn} simplify
 * @param {number | false} precision
 * @return {Node}
 */
function foldFactors(items, start, end, simplify, precision) {
  let coeff = 1;
  // Num factors by exponent, so an inexact quotient can be re-emitted as a
  // reduced `numerator / denominator`.
  let numerator = 1;
  let denominator = 1;
  /** @type {{exponent: 1 | -1, value: number, unit: string, rawUnit?: string}[]} */
  const dims = [];
  /** @type {ProductFactor[]} */
  const opaque = [];
  /** @type {{exponent: 1 | -1, value: number}[]} */
  const scalarChain = [];

  /**
   * @param {1 | -1} exponent
   * @param {Node} n
   * @return {void}
   */
  function processFactor(exponent, n) {
    if (n.type === 'Num') {
      if (exponent === 1) {
        coeff *= n.value;
        numerator *= n.value;
      } else {
        coeff /= n.value; // §10.9.1: 1/0 → ±Infinity, 0/0 → NaN per IEEE-754
        denominator *= n.value;
      }
      scalarChain.push({ exponent, value: n.value });
      return;
    }
    if (n.type === 'Dim') {
      dims.push({ exponent, value: n.value, unit: n.unit, rawUnit: n.rawUnit });
      scalarChain.push({ exponent, value: n.value });
      return;
    }
    opaque.push({ exponent, node: n });
  }

  for (let i = start; i < end; i++) {
    processFactor(items[i].exponent, items[i].node);
  }

  // §10.2 typed division. Higher-power cancellation (`px^2 / px`) is left
  // unreduced — consumers don't rely on it and the spec doesn't require it.
  const cancelled = tryCancelPair(dims, precision);
  if (cancelled !== null) {
    coeff *= cancelled.factor;
    numerator *= cancelled.factor;
  }
  const divides = denominator !== 1 || cancelled !== null;
  const remainingDims = cancelled ? cancelled.remaining : dims;
  const loneDim =
    remainingDims.length === 1 &&
    remainingDims[0].exponent === 1 &&
    opaque.length === 0
      ? remainingDims[0]
      : null;
  const value = loneDim === null ? coeff : chainValue(scalarChain);

  // An inexact quotient stays symbolic when its numerator and denominator
  // print exactly; otherwise it is folded and rounded at serialization.
  if (divides && Number.isFinite(value) && !isExact(value, precision)) {
    const rational = rationalProduct(
      numerator,
      denominator,
      loneDim,
      remainingDims,
      opaque,
      precision
    );
    if (rational !== null) {
      return rational;
    }
  }

  // §10.10 distributive multiplication: `0.5 * (100vw - 10px)` → `50vw - 5px`.
  // Only distribute when every Sum term is Num/Dim — partial distribution
  // over opaque terms matches neither the legacy implementation nor csstools.
  if (remainingDims.length === 0 && isScalarSum(opaque)) {
    const sum = /** @type {import('../node.js').Sum} */ (opaque[0].node);
    const distributed = sum.terms.map((t) => ({
      sign: t.sign,
      node: simplify(
        mkProduct([
          { exponent: 1, node: num(coeff) },
          { exponent: 1, node: t.node },
        ])
      ),
    }));
    return mkSum(distributed);
  }

  if (loneDim !== null) {
    return dim(value, loneDim.unit, loneDim.rawUnit);
  }

  if (remainingDims.length === 0 && opaque.length === 0) {
    return num(coeff);
  }

  /** @type {ProductFactor[]} */
  const factors = [];
  if (coeff !== 1) {
    factors.push({ exponent: 1, node: num(coeff) });
  }
  for (const d of remainingDims) {
    factors.push({
      exponent: d.exponent,
      node: dim(d.value, d.unit, d.rawUnit),
    });
  }
  factors.push(...opaque);

  return mkProduct(factors);
}

/**
 * A substitution function (`var()`, `env()`, `attr()`, ...) is replaced by
 * tokens, not by a value, so factors cannot move or cancel across it. Any
 * function the parser does not recognise (`anchor()`, `foo()`, ...) is also an
 * OpaqueCall and is treated the same, conservatively. A grouped Product is a
 * parenthesized substitution and is equally opaque.
 * @param {Node} node
 * @return {boolean}
 */
function isBarrier(node) {
  return (
    node.type === 'OpaqueCall' ||
    (node.type === 'Product' && node.grouped === true)
  );
}

/**
 * Flatten a simplified factor through nested ungrouped Products and the
 * canonical negation form, so barriers are visible at the top level.
 * @param {ProductFactor[]} out
 * @param {1 | -1} exponent
 * @param {Node} node
 * @return {boolean} Whether a barrier was pushed.
 */
function flattenFactor(out, exponent, node) {
  if (node.type === 'Product' && !node.grouped) {
    let barrier = false;
    for (const inner of node.factors) {
      if (
        flattenFactor(
          out,
          /** @type {1 | -1} */ (exponent * inner.exponent),
          inner.node
        )
      )
        barrier = true;
    }
    return barrier;
  }
  if (node.type === 'Sum' && node.terms.length === 1) {
    out.push({ exponent, node: num(-1) });
    return flattenFactor(out, exponent, node.terms[0].node);
  }
  out.push({ exponent, node });
  return isBarrier(node);
}

/**
 * @param {Product} product
 * @param {SimplifyFn} simplify
 * @param {number | false} [precision] A quotient that is not exact at this
 *   precision stays symbolic (`100% / 3`) instead of being rounded.
 * @return {Node}
 */
function simplifyProduct(product, simplify, precision = false) {
  /** @type {ProductFactor[]} */
  const items = [];
  let hasBarrier = false;
  for (const f of product.factors) {
    if (flattenFactor(items, f.exponent, simplify(f.node))) hasBarrier = true;
  }
  if (!hasBarrier)
    return foldFactors(items, 0, items.length, simplify, precision);

  // Fold each run between barriers on its own; never move or cancel a factor
  // across a barrier, and keep each barrier's own operator.
  /** @type {ProductFactor[]} */
  const factors = [];
  let start = 0;
  for (let i = 0; i <= items.length; i++) {
    if (i < items.length && !isBarrier(items[i].node)) continue;
    if (i - start === 1) factors.push(items[start]);
    else if (i - start > 1)
      factors.push({
        exponent: 1,
        node: foldFactors(items, start, i, simplify, precision),
      });
    if (i < items.length) factors.push(items[i]);
    start = i + 1;
  }
  const result = mkProduct(factors);
  return product.grouped === true ? mkGroup(result) : result;
}

export { simplifyProduct };
