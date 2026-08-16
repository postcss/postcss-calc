export type Node = import('../node.js').Node;
export type SimplifyFn = import('../simplify.js').SimplifyFn;
export type MathSimplifier = (name: string, args: Node[]) => Node;
/**
 * Whether a bare CSS math function has an implemented simplifier.
 *
 * @param {string} name
 * @return {boolean}
 */
declare function isSupportedMathFunction(name: string): boolean;
/**
 * @param {Extract<Node, { type: 'Call' }>} node
 * @param {SimplifyFn} simplify
 * @return {Node}
 */
declare function simplifyCall(node: Extract<Node, {
    type: 'Call';
}>, simplify: SimplifyFn): Node;
export { isSupportedMathFunction, simplifyCall };
