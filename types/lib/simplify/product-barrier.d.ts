export type Node = import('../node.js').Node;
export type ProductFactor = import('../node.js').ProductFactor;
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
declare function isBarrier(node: Node): boolean;
/**
 * Flatten a simplified factor through nested ungrouped Products and the
 * canonical negation form, so barriers are visible at the top level.
 * @param {ProductFactor[]} out
 * @param {1 | -1} exponent
 * @param {Node} node
 * @return {boolean} Whether a barrier was pushed.
 */
declare function flattenFactor(out: ProductFactor[], exponent: 1 | -1, node: Node): boolean;
export { flattenFactor, isBarrier };
