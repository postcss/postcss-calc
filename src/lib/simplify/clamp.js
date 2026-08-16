import { num, dim, call } from '../node.js';
import { foldConstArgs } from './fold.js';

/** @typedef {import('../node.js').Node} Node */

/**
 * @param {Node[]} args
 * @return {Node}
 */
function simplifyClamp(args) {
  if (args.length === 3) {
    const fold = foldConstArgs(args);
    if (fold !== null) {
      const [lo, v, hi] = /** @type {[number, number, number]} */ (fold.values);
      // Spec §10.8: clamp(MIN, VAL, MAX) = max(MIN, min(VAL, MAX)). The
      // outer max(MIN, …) means MIN wins when MIN > MAX — not MAX.
      const clamped = Math.max(lo, Math.min(v, hi));
      return fold.unit === '' ? num(clamped) : dim(clamped, fold.unit);
    }
  }
  return call('clamp', args);
}

export { simplifyClamp };
