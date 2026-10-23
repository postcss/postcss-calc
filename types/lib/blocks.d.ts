export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Blocks = {
    close: Int32Array;
    base: number;
};
/**
 * Match every block opener in `[start, end)` to its closer. Matching is LIFO:
 * a closer that does not match the innermost open block is ignored, so the
 * open stack survives the mismatch. Openers with no closer before `end` map
 * to -1, as if the range were the whole list.
 *
 * `maxDepth` is the largest number of blocks open at once. The caller decides
 * whether that exceeds the nesting limit.
 *
 * @param {CSSToken[]} tokens
 * @param {number} [start]
 * @param {number} [end]
 * @return {{blocks: Blocks, maxDepth: number}}
 */
declare function matchBlocks(tokens: CSSToken[], start?: number, end?: number): {
    blocks: Blocks;
    maxDepth: number;
};
/**
 * The closer of the opener at `index`, or -1 when it has no closer or the
 * matching does not cover `index`. The result is an absolute token index.
 *
 * @param {Blocks} blocks
 * @param {number} index
 * @return {number}
 */
declare function closerAt(blocks: Blocks, index: number): number;
/**
 * The closer of the opener at `index`, or -1 when it has none inside
 * `[index, end)`.
 *
 * @param {Blocks} blocks
 * @param {number} index
 * @param {number} end
 * @return {number}
 */
declare function closeIn(blocks: Blocks, index: number, end: number): number;
/**
 * Index after the component (a token, or a whole block) that starts at `index`,
 * never past `end`.
 *
 * @param {Blocks} blocks
 * @param {number} index
 * @param {number} end
 * @return {number}
 */
declare function nextComponent(blocks: Blocks, index: number, end: number): number;
/**
 * First comma outside every block in `[start, end)`, or -1.
 *
 * @param {CSSToken[]} tokens
 * @param {Blocks} blocks
 * @param {number} start
 * @param {number} end
 * @return {number}
 */
declare function firstTopLevelComma(tokens: CSSToken[], blocks: Blocks, start: number, end: number): number;
export { closerAt, closeIn, firstTopLevelComma, matchBlocks, nextComponent };
