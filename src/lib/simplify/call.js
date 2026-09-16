// Pre-simplify args once, route by name. Leaf folds receive simplified
// args so they don't need to recurse into `simplify` themselves.

import { call } from '../node.js';
import { mathFunctions, isCalculationFunction } from '../functions.js';

/** @typedef {import('../node.js').Node} Node */
/** @typedef {import('../simplify.js').SimplifyFn} SimplifyFn */
/** @typedef {(name: string, args: Node[]) => Node} MathSimplifier */

/**
 * @param {Extract<Node, { type: 'Call' }>} node
 * @param {SimplifyFn} simplify
 * @return {Node}
 */
function simplifyCall(node, simplify) {
  const name = node.name.toLowerCase();

  if (isCalculationFunction(name)) {
    if (node.args.length !== 1) {
      throw new Error(`${node.name}() takes exactly one argument`);
    }
    return simplify(node.args[0]);
  }

  const args = node.args.map((a) => simplify(a));

  const simplifier = mathFunctions.get(name)?.simplify;
  if (simplifier) {
    return simplifier(name, args);
  }

  return call(node.name, args, node.rawName);
}

export { simplifyCall };
