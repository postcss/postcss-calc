/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
/**
 * Maps a token index to the offset in the joined raw text of `tokens` where
 * that token starts, or the total length past the end. Only diagnostics need
 * offsets, and a fallback can report many of them, so the table is built on
 * the first call and each lookup after that is constant time.
 *
 * @param {CSSToken[]} tokens
 * @return {(index: number) => number}
 */
declare function offsetLookup(tokens: CSSToken[]): (index: number) => number;
/**
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @return {string}
 */
declare function joinTokens(tokens: CSSToken[], start: number, end: number): string;
export { joinTokens, offsetLookup };
