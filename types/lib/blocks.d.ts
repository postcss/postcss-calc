export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
/**
 * Match every block opener in the list to its closer. Matching is LIFO: a
 * closer that does not match the innermost open block is ignored, so the
 * open stack survives the mismatch. Openers with no closer map to -1.
 *
 * `maxDepth` is the largest number of blocks open at once. The caller decides
 * whether that exceeds the nesting limit.
 *
 * @param {CSSToken[]} tokens
 * @return {{close: Int32Array, maxDepth: number}} `close[i]` is the closer index for opener `i`, or -1.
 */
declare function matchBlocks(tokens: CSSToken[]): {
    close: Int32Array;
    maxDepth: number;
};
/**
 * The closer of the opener at `index`, or -1 when it has none inside
 * `[index, end)`.
 *
 * @param {Int32Array} close
 * @param {number} index
 * @param {number} end
 * @return {number}
 */
declare function closeIn(close: Int32Array, index: number, end: number): number;
/**
 * Index after the component (a token, or a whole block) that starts at `index`,
 * never past `end`.
 *
 * @param {Int32Array} close
 * @param {number} index
 * @param {number} end
 * @return {number}
 */
declare function nextComponent(close: Int32Array, index: number, end: number): number;
/**
 * First comma outside every block in `[start, end)`, or -1.
 *
 * @param {CSSToken[]} tokens
 * @param {Int32Array} close
 * @param {number} start
 * @param {number} end
 * @return {number}
 */
declare function firstTopLevelComma(tokens: CSSToken[], close: Int32Array, start: number, end: number): number;
export { closeIn, firstTopLevelComma, matchBlocks, nextComponent };
