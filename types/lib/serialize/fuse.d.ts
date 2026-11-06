export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
/**
 * Whether a token ending in `last` and a token starting with `first` would
 * read back as one token if written without a separator. The check is
 * conservative: it may ask for a separator that is not strictly needed.
 *
 * @param {string | undefined} last
 * @param {string | undefined} first
 * @return {boolean}
 */
declare function wouldFuse(last: string | undefined, first: string | undefined): boolean;
/**
 * What keeps a replacement apart from a neighbour it would fuse with. A space
 * rather than the empty comment CSS Syntax 3 §9 allows, because tools that
 * strip comments from values (such as minifiers run after this plugin) would
 * fuse the tokens again.
 */
declare const FUSE_SEPARATOR = " ";
/**
 * Whether `token` is an end-of-file token. It marks the end of a tokenized
 * string, so one inside a list (for example from concatenated `tokenize`
 * results) is not part of the CSS and is skipped.
 *
 * @param {CSSToken | undefined} token
 * @return {boolean}
 */
declare function isEOF(token: CSSToken | undefined): boolean;
/**
 * The index of the first non-EOF token in `list[i, end)`, or `end` when there
 * is none.
 *
 * @param {CSSToken[]} list
 * @param {number} i
 * @param {number} end
 * @return {number}
 */
declare function nextCss(list: CSSToken[], i: number, end: number): number;
/**
 * The first character of the first non-EOF token in `list[start, end)`.
 *
 * @param {CSSToken[]} list
 * @param {number} start
 * @param {number} end
 * @return {string | undefined}
 */
declare function firstCharOf(list: CSSToken[], start: number, end: number): string | undefined;
/**
 * The last character of the last non-EOF token in `list[0, end)`.
 *
 * @param {CSSToken[]} list
 * @param {number} end
 * @return {string | undefined}
 */
declare function lastCharBefore(list: CSSToken[], end: number): string | undefined;
export { FUSE_SEPARATOR, firstCharOf, isEOF, lastCharBefore, nextCss, wouldFuse, };
