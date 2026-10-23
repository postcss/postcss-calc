export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Node = import('../node.js').Node;
export type OpaqueComponent = import('../node.js').OpaqueComponent;
export type ParseState = import('./state.js').ParseState;
export type ParseRange = import('../parser.js').ParseRange;
/**
 * @param {ParseState} state
 * @param {number} index
 * @param {string} name
 * @param {string} rawName
 * @param {ParseRange} parseRange
 * @return {Node}
 */
declare function parseOpaqueCall(state: ParseState, index: number, name: string, rawName: string, parseRange: ParseRange): Node;
/**
 * @param {ParseState} state
 * @param {number} index
 * @param {string} name
 * @param {string} rawName
 * @param {ParseRange} parseRange
 * @return {Node}
 */
declare function parseVar(state: ParseState, index: number, name: string, rawName: string, parseRange: ParseRange): Node;
export { parseOpaqueCall, parseVar };
