/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
/**
 * Maps a token index in `[start, end)` to the offset in the joined raw text of
 * that range where the token starts, or the range's total length past its end.
 * Only diagnostics need offsets, and a fallback can report many of them, so the
 * table is built on the first call and each lookup after that is constant time.
 *
 * @param {CSSToken[]} tokens
 * @param {number} [start]
 * @param {number} [end]
 * @return {(index: number) => number}
 */
declare function offsetLookup(tokens: CSSToken[], start?: number, end?: number): (index: number) => number;
/**
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @return {string}
 */
declare function joinTokens(tokens: CSSToken[], start: number, end: number): string;
export { joinTokens, offsetLookup };
