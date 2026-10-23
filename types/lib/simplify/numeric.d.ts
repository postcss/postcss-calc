export type Node = import('../node.js').Node;
/** @typedef {import('../node.js').Node} Node */
/**
 * `%` is property-context-dependent (§10.6), so it stays opaque.
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
declare function simplifyAbs(args: Node[], name: string): Node;
/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
declare function simplifySign(args: Node[], name: string): Node;
/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
declare function simplifySqrt(args: Node[], name: string): Node;
/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
declare function simplifyExp(args: Node[], name: string): Node;
/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
declare function simplifyPow(args: Node[], name: string): Node;
/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
declare function simplifyLog(args: Node[], name: string): Node;
export { simplifyAbs, simplifyExp, simplifyLog, simplifyPow, simplifySign, simplifySqrt, };
