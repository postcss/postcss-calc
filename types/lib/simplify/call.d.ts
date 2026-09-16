export type Node = import('../node.js').Node;
export type SimplifyFn = import('../simplify.js').SimplifyFn;
export type MathSimplifier = (name: string, args: Node[]) => Node;
/** @typedef {import('../node.js').Node} Node */
/** @typedef {import('../simplify.js').SimplifyFn} SimplifyFn */
/** @typedef {(name: string, args: Node[]) => Node} MathSimplifier */
/**
 * @param {Extract<Node, { type: 'Call' }>} node
 * @param {SimplifyFn} simplify
 * @return {Node}
 */
declare function simplifyCall(node: Extract<Node, {
    type: 'Call';
}>, simplify: SimplifyFn): Node;
export { simplifyCall };
