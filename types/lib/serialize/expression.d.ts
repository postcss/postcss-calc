export type Node = import('../node.js').Node;
export type Sum = import('../node.js').Sum;
export type SumTerm = import('../node.js').SumTerm;
export type ProductFactor = import('../node.js').ProductFactor;
export type SerializeSession = import('./precision.js').SerializeSession;
/**
 * @typedef {import('../node.js').Node} Node
 * @typedef {import('../node.js').Sum} Sum
 * @typedef {import('../node.js').SumTerm} SumTerm
 * @typedef {import('../node.js').ProductFactor} ProductFactor
 * @typedef {import('./precision.js').SerializeSession} SerializeSession
 */
/**
 * @param {Node} node
 * @param {SerializeSession} session
 * @param {number} [parentPrecedence]
 * @param {boolean} [groupedRequired]
 * @return {void}
 */
declare function emitNode(node: Node, session: SerializeSession, parentPrecedence?: number, groupedRequired?: boolean): void;
/**
 * @param {Node} node
 * @param {SerializeSession} session
 * @return {void}
 */
declare function emitLeadingNeg(node: Node, session: SerializeSession): void;
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
export { emitNode, emitLeadingNeg, emitCall, emitOpaqueCall, emitMathResult, emitNestedMathResult, };
