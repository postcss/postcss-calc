export type Node = import('../node.js').Node;
/**
 * @typedef {import('../node.js').Node} Node
 */
declare const SUM_PRECEDENCE = 1;
declare const PRODUCT_PRECEDENCE = 2;
declare const ATOMIC_PRECEDENCE = 3;
declare const UNARY_PRECEDENCE = 3;
/** @param {Node} node @return {number} */
declare function precedence(node: Node): number;
/**
 * @param {Node} node
 * @param {number} parentPrecedence
 * @param {boolean} groupedRequired
 * @return {boolean}
 */
declare function needsParentheses(node: Node, parentPrecedence: number, groupedRequired: boolean): boolean;
export { SUM_PRECEDENCE, PRODUCT_PRECEDENCE, ATOMIC_PRECEDENCE, UNARY_PRECEDENCE, precedence, needsParentheses, };
