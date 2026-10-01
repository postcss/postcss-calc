export type Node = import('./node.js').Node;
export type SimplifyFn = (node: Node) => Node;
/**
 * Simplify is an independent, composable AST transformation. It may
 * synthesize canonical nodes while preserving the Node -> Node contract.
 * @param {Node} node
 * @param {number | false} [precision] When set, divisions and unit
 *   conversions that are not exact at this precision stay symbolic.
 * @param {number} [depth]
 * @return {Node}
 */
declare function simplify(node: Node, precision?: number | false, depth?: number): Node;
export { simplify };
