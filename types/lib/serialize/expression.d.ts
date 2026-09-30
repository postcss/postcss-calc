export type Node = import('../node.js').Node;
export type Sum = import('../node.js').Sum;
export type Product = import('../node.js').Product;
export type ProductFactor = import('../node.js').ProductFactor;
export type SerializeSession = import('./precision.js').SerializeSession;
/**
 * @typedef {import('../node.js').Node} Node
 * @typedef {import('../node.js').Sum} Sum
 * @typedef {import('../node.js').Product} Product
 * @typedef {import('../node.js').ProductFactor} ProductFactor
 * @typedef {import('./precision.js').SerializeSession} SerializeSession
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
/**
 * @param {Node} node
 * @param {SerializeSession} session
 * @param {number} [parentPrecedence]
 * @param {boolean} [groupedRequired]
 * @return {void}
 */
declare function emitNode(node: Node, session: SerializeSession, parentPrecedence?: number, groupedRequired?: boolean): void;
/**
 * @param {import('../node.js').Call} node
 * @param {SerializeSession} session
 * @param {string} [callNameOverride]
 * @return {void}
 */
declare function emitCall(node: import('../node.js').Call, session: SerializeSession, callNameOverride?: string): void;
/**
 * @param {import('../node.js').OpaqueCall} node
 * @param {SerializeSession} session
 * @param {string} [callNameOverride]
 * @return {void}
 */
declare function emitOpaqueCall(node: import('../node.js').OpaqueCall, session: SerializeSession, callNameOverride?: string): void;
/**
 * @param {import('../node.js').SumTerm} term
 * @param {1 | -1} multiplier
 * @param {number | false} precision
 * @return {1 | -1}
 */
declare function termSign(term: import('../node.js').SumTerm, multiplier: 1 | -1, precision: number | false): 1 | -1;
/**
 * @param {import('../node.js').SumTerm[]} terms
 * @param {SerializeSession} session
 * @param {1 | -1} [multiplier]
 * @return {void}
 */
declare function emitSumTerms(terms: import('../node.js').SumTerm[], session: SerializeSession, multiplier?: 1 | -1): void;
/** @param {Sum} sum @param {SerializeSession} session @return {void} */
declare function emitSum(sum: Sum, session: SerializeSession): void;
/**
 * @param {Node} node
 * @param {SerializeSession} session
 * @return {void}
 */
declare function emitLeadingNeg(node: Node, session: SerializeSession): void;
/**
 * @param {ProductFactor[]} factors
 * @param {SerializeSession} session
 * @param {number} [start]
 * @param {number} [coefficientValue]
 * @param {import('../node.js').Num} [coefficientNode]
 * @return {void}
 */
declare function emitProductFactors(factors: ProductFactor[], session: SerializeSession, start?: number, coefficientValue?: number, coefficientNode?: import('../node.js').Num): void;
/** @param {Product} product @param {SerializeSession} session @return {void} */
declare function emitProduct(product: Product, session: SerializeSession): void;
/**
 * @param {Node} node
 * @param {SerializeSession} session
 * @param {string} wrapper
 * @return {void}
 */
declare function emitMathResult(node: Node, session: SerializeSession, wrapper: string): void;
/**
 * @param {Node} node
 * @param {SerializeSession} session
 * @param {string[]} [buffer]
 * @return {void}
 */
declare function emitNestedMathResult(node: Node, session: SerializeSession, buffer?: string[]): void;
export { SUM_PRECEDENCE, PRODUCT_PRECEDENCE, ATOMIC_PRECEDENCE, UNARY_PRECEDENCE, precedence, needsParentheses, emitNode, emitCall, emitOpaqueCall, termSign, emitSumTerms, emitSum, emitLeadingNeg, emitProductFactors, emitProduct, emitMathResult, emitNestedMathResult, };
