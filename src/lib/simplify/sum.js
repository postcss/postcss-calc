'use strict';

const { mkSum, num, dim } = require('../node.js');
const { baseOf } = require('../convertUnits.js');
const { mergeConvertibleBuckets } = require('./bucket.js');

/**
 * @typedef {import('../node.js').Node} Node
 * @typedef {import('../node.js').Sum} Sum
 * @typedef {import('../node.js').SumTerm} SumTerm
 * @typedef {import('../simplify.js').SimplifyFn} SimplifyFn
 * @typedef {import('./bucket.js').UnitBucket} UnitBucket
 */

/**
 * @param {Sum} sum
 * @param {SimplifyFn} simplify
 * @return {Node}
 */
function simplifySum(sum, simplify) {
  // §10.10 two-phase dim handling: phase 1 buckets by exact unit (`1em + 1em`
  // → `2em`); phase 2 merges convertible same-base buckets into the first-
  // encountered unit. `100vh - 5rem - 10rem - 100px` → `-15rem` in phase 1,
  // then vh/rem/px stay separate in phase 2 (none convert to each other).
  let numTotal = 0;
  /** @type {Map<string, UnitBucket>} */
  const byUnit = new Map();
  /** @type {SumTerm[]} */
  const opaque = [];
  let bucketOrder = 0;

  /**
   * @param {1 | -1} sign
   * @param {Node} n
   * @return {void}
   */
  function processTerm(sign, n) {
    if (n.type === 'Sum') {
      for (const inner of n.terms) {
        processTerm(/** @type {1 | -1} */ (sign * inner.sign), inner.node);
      }
      return;
    }
    if (n.type === 'Num') {
      numTotal += sign * n.value;
      return;
    }
    if (n.type === 'Dim') {
      const key = n.unit.toLowerCase();
      const existing = byUnit.get(key);
      if (existing) {
        existing.total += sign * n.value;
      } else {
        byUnit.set(key, {
          unit: n.unit,
          total: sign * n.value,
          base: baseOf(n.unit),
          order: bucketOrder++,
        });
      }
      return;
    }
    opaque.push({ sign, node: n });
  }

  for (const t of sum.terms) {
    processTerm(t.sign, simplify(t.node));
  }

  // mkSum drops zero-valued Nums, so pushing the numeric total
  // unconditionally is harmless. Zero-valued unit buckets are kept for
  // type info (WPT calc-serialization-002).
  /** @type {SumTerm[]} */
  const terms = [{ sign: 1, node: num(numTotal) }];
  for (const bucket of mergeConvertibleBuckets([...byUnit.values()])) {
    terms.push({ sign: 1, node: dim(bucket.total, bucket.unit) });
  }
  terms.push(...opaque);

  return mkSum(terms);
}

module.exports = { simplifySum };
