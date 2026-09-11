/* §10.10 phase 2: merge convertible same-base unit buckets into the
   first-encountered unit (px absorbs cm/in/pt/pc, deg absorbs
   rad/grad/turn, …). Buckets with `base === null` (relative or unknown
   units) keep their own slot.
 */

import { convert } from '../convertUnits.js';

/**
 * @typedef {object} UnitBucket
 * @property {string} unit
 * @property {string} [rawUnit]
 * @property {number} total
 * @property {number} scale largest |term| accumulated into `total`, for noise detection
 * @property {import('../convertUnits.js').BaseType | null} base
 */

/** Mutates `buckets` in place — totals of survivor buckets accumulate the
 *  converted values of merged neighbors. Caller must not reuse the input.
 * @param {UnitBucket[]} buckets
 * @return {UnitBucket[]}
 */
function mergeConvertibleBuckets(buckets) {
  /** @type {Map<import('../convertUnits.js').BaseType, UnitBucket>} */ const representative =
    new Map();
  /** @type {UnitBucket[]} */ const out = [];
  for (const b of buckets) {
    if (b.base === null) {
      out.push(b);
      continue;
    }
    const first = representative.get(b.base);
    if (!first) {
      representative.set(b.base, b);
      out.push(b);
      continue;
    }
    const converted = convert(b.total, b.unit, first.unit);
    if (converted === null) {
      out.push(b);
      continue;
    }
    first.total += converted;
    first.scale = Math.max(first.scale, Math.abs(converted));
  }
  return out;
}

export { mergeConvertibleBuckets };
