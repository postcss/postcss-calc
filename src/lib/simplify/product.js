import { mkSum, mkProduct, mkGroup, num, dim } from '../node.js';
import { tryCancelPair } from './cancel.js';
import { flattenFactor, isBarrier } from './product-barrier.js';
import {
  chainValue,
  foldsExactly,
  isScalarSum,
  rationalProduct,
} from './product-quotient.js';

/**
 * @typedef {import('../node.js').Node} Node
 * @typedef {import('../node.js').Product} Product
 * @typedef {import('../node.js').ProductFactor} ProductFactor
 * @typedef {import('../simplify.js').SimplifyFn} SimplifyFn
 */

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
    coeff *= cancelled.numerator / cancelled.denominator;
    numerator *= cancelled.numerator;
    denominator *= cancelled.denominator;
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
  const distributable = remainingDims.length === 0 && isScalarSum(opaque);

  // An inexact quotient stays symbolic when its numerator and denominator
  // print exactly; otherwise it is folded and rounded at serialization.
  if (divides && !foldsExactly(value, opaque, distributable, precision)) {
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
  if (distributable) {
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
