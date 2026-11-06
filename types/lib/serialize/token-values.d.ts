import { TokenType } from '@csstools/css-tokenizer';
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/**
 * Whether `raw` is `prefix + first + last`, without building that string.
 *
 * @param {string} raw
 * @param {string} prefix
 * @param {string} first
 * @param {string} last
 * @return {boolean}
 */
declare function sameText(raw: string, prefix: string, first: string, last: string): boolean;
/**
 * The value of a CSS identifier from its raw text: each escape is replaced by
 * the code point it names, so `c\61 lc` reads `calc`.
 *
 * @param {string} raw
 * @return {string}
 */
declare function decodeIdentifier(raw: string): string;
/**
 * The detail object of a numeric token, as the tokenizer makes it.
 *
 * @param {TokenType} type
 * @param {string} number The signed number text.
 * @param {string} unit
 * @return {object}
 */
declare function numericDetail(type: TokenType, number: string, unit: string): object;
/**
 * A printed token. Its offsets are unspecified.
 *
 * @param {TokenType} type
 * @param {string} raw
 * @param {object | null | undefined} detail
 * @return {CSSToken}
 */
declare function newToken(type: TokenType, raw: string, detail: object | null | undefined): CSSToken;
export { decodeIdentifier, newToken, numericDetail, sameText };
