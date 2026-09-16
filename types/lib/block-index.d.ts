export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
/**
 * Read-only delimiter navigation for one native token stream range.
 */
declare class BlockIndex {
    #private;
    /**
     * Build the delimiter index once for a token stream range. Matching remains
     * LIFO: a mismatched closer is ignored and does not disturb the open stack.
     *
     * @param {CSSToken[]} tokens
     * @param {number} start
     * @param {number} end
     */
    constructor(tokens: CSSToken[], start: number, end: number);
    /** @return {number} */
    get maxDepth(): number;
    /** @param {number} openPosition @param {number} [endPosition] @return {number} */
    closeOf(openPosition: number, endPosition?: number): number;
    /** @param {number} position @param {number} endPosition @return {number} */
    nextComponent(position: number, endPosition: number): number;
    /** @param {number} startPosition @param {number} endPosition @return {number} */
    firstTopLevelComma(startPosition: number, endPosition: number): number;
}
/**
 * Build the delimiter index once for a token stream range. Matching remains
 * LIFO: a mismatched closer is ignored and does not disturb the open stack.
 *
 * @param {CSSToken[]} tokens
 * @param {number} [start]
 * @param {number} [end]
 * @return {BlockIndex}
 */
declare function indexBlocks(tokens: CSSToken[], start?: number, end?: number): BlockIndex;
export { indexBlocks };
