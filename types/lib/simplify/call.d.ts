export type Node = import("../node.js").Node;
export type SimplifyFn = import("../simplify.js").SimplifyFn;
/** @typedef {import('../node.js').Node} Node */
/** @typedef {import('../simplify.js').SimplifyFn} SimplifyFn */
/**
 * @param {Extract<Node, { type: 'Call' }>} node
 * @param {SimplifyFn} simplify
 * @return {Node}
 */
export function simplifyCall(node: Extract<Node, {
    type: "Call";
}>, simplify: SimplifyFn): Node;
