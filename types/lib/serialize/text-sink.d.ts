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
     * The raw text of `list[start, end)`.
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
export { TextSink, wouldFuse };
