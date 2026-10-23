import { call } from '../node.js';
import { foldConstArgs, chosenArg } from './fold.js';

/** @typedef {import('../node.js').Node} Node */

/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
function simplifyMinMax(args, name) {
  const fold = foldConstArgs(args);
  if (fold !== null) {
    const fn = name.toLowerCase() === 'min' ? Math.min : Math.max;
    const value = fn(...fold.values);
    return chosenArg(args, fold, value);
  }
  return call(name, args);
}

export { simplifyMinMax };
