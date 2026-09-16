export type Node = import('./node.js').Node;
export type SimplifyFn = (node: Node) => Node;
/**
 * @typedef {import('./node.js').Node} Node
 *
 * Recursive simplifier reference, threaded into Sum/Product/Call/OpaqueCall. Lets
 * leaf fold modules avoid circular imports of the entry function.
 * @typedef {(node: Node) => Node} SimplifyFn
 */
/**
 * Simplify is an independent, composable AST transformation. It may
 * synthesize canonical nodes while preserving the Node -> Node contract.
 * @param {Node} node
 * @param {number} [depth]
 * @return {Node}
 */
declare function simplify(node: Node, depth?: number): Node;
export { simplify };
