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
/**
 * The output of a printer that keeps its printed text as strings.
 */
declare class TextSink {
    /** @type {string[]} */
    parts: string[];
    /** @type {boolean} */
    signed: boolean;
    /**
     * Write a space when a token starting with `first` would fuse with the
     * text before it. A sign belongs to the token that follows it.
     *
     * @param {string} first
     * @return {void}
     */
    separate(first: string): void;
    /** @return {void} */
    open(): void;
    /** @return {void} */
    close(): void;
    /** @return {void} */
    comma(): void;
    /**
     * @param {'+' | '-' | '*' | '/'} operator
     * @return {void}
     */
    op(operator: '+' | '-' | '*' | '/'): void;
    /** The sign of the next number, identifier or function. @return {void} */
    minus(): void;
    /** @param {string} name @return {void} */
    fn(name: string): void;
    /** @param {string} raw @return {void} */
    ident(raw: string): void;
    /** @param {string} text @return {void} */
    number(text: string): void;
    /**
     * @param {string} text
     * @param {string} unit
     * @return {void}
     */
    dimension(text: string, unit: string): void;
    /**
     * The raw text of `list[start, end)`. EOF tokens are skipped, as the token
     * sink skips them, so an empty part never hides the last character from
     * the next separator check.
     *
     * @param {CSSToken[]} list
     * @param {number} start
     * @param {number} end
     * @return {void}
     */
    source(list: CSSToken[], start: number, end: number): void;
    /** @return {string} */
    join(): string;
}
export { FUSE_SEPARATOR, TextSink, firstCharOf, isEOF, lastCharBefore, wouldFuse, };
