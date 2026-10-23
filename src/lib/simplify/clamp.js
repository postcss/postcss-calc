import { call } from '../node.js';
import { foldConstArgs, chosenArg } from './fold.js';
import { simplifyMinMax } from './min-max.js';
import { isClampKeyword } from '../keywords.js';

/** @typedef {import('../node.js').Node} Node */

/**
 * @param {Node[]} args
 * @return {Node}
 */
function simplifyClamp(args) {
  if (args.length === 3) {
    const minNone = isClampKeyword(args[0], 0);
    const maxNone = isClampKeyword(args[2], 2);

    if (minNone && maxNone) {
      return args[1];
    }
    if (minNone) {
      return simplifyMinMax([args[1], args[2]], 'min');
    }
    if (maxNone) {
      return simplifyMinMax([args[0], args[1]], 'max');
    }

    const fold = foldConstArgs(args);
    if (fold !== null) {
      const [lo, v, hi] = /** @type {[number, number, number]} */ (fold.values);
      // Spec §10.8: clamp(MIN, VAL, MAX) = max(MIN, min(VAL, MAX)). The
      // outer max(MIN, …) means MIN wins when MIN > MAX — not MAX.
      const clamped = Math.max(lo, Math.min(v, hi));
      return chosenArg(args, fold, clamped);
    }
  }
  return call('clamp', args);
}

export { simplifyClamp };
