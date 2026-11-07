export type ParseState = import('./parser/state.js').ParseState;
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Node = import('./node.js').Node;
export type SumTerm = import('./node.js').SumTerm;
export type ProductFactor = import('./node.js').ProductFactor;
export type Blocks = import('./blocks.js').Blocks;
export type ParseRange = (tokens: CSSToken[], blocks: Blocks, start: number, end: number) => Node;
/**
 * Parse `[start, end)` as one complete expression.
 *
 * @param {CSSToken[]} tokens
 * @param {Blocks} blocks
 * @param {number} start
 * @param {number} end
 * @return {Node}
 */
declare function parseRange(tokens: CSSToken[], blocks: Blocks, start: number, end: number): Node;
/**
 * Parse the token range `[start, end)` of `tokens` as one calculation.
 * `blocks` is the matching from `matchBlocks(tokens)`; when omitted, it is
 * built and depth-checked from `tokens`.
 *
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @param {Blocks} [blocks]
 * @return {Node}
 */
declare function parse(tokens: CSSToken[], start: number, end: number, blocks?: Blocks): Node;
export { parse, parseRange };
