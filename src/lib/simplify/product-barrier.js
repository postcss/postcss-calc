import { num } from '../node.js';

/**
 * @typedef {import('../node.js').Node} Node
 * @typedef {import('../node.js').ProductFactor} ProductFactor
 */

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

export { flattenFactor, isBarrier };
