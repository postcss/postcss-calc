export type ParseState = import('./parser/state.js').ParseState;
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Node = import('./node.js').Node;
export type SumTerm = import('./node.js').SumTerm;
export type ProductFactor = import('./node.js').ProductFactor;
export type ParseRange = (tokens: CSSToken[], close: Int32Array, start: number, end: number) => Node;
/**
 * Parse `[start, end)` as one complete expression.
 *
 * @param {CSSToken[]} tokens
 * @param {Int32Array} close
 * @param {number} start
 * @param {number} end
 * @return {Node}
 */
declare function parseRange(tokens: CSSToken[], close: Int32Array, start: number, end: number): Node;
/**
 * Parse the token range `[start, end)` of `tokens` as one calculation.
 * `close` is the closer array from `matchBlocks(tokens)`; when omitted, it is
 * built and depth-checked from `tokens`.
 *
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @param {Int32Array} [close]
 * @return {Node}
 */
declare function parse(tokens: CSSToken[], start: number, end: number, close?: Int32Array): Node;
export { parse, parseRange };
