export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type BlockIndex = Readonly<{
    closeOf: (openIndex: number, end?: number) => number;
    nextComponent: (index: number, end: number) => number;
    firstTopLevelComma: (start: number, end: number) => number;
    maxDepth: number;
}>;
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
