export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Sink = import('./sink.js').Sink;
/**
 * The output of a printer that keeps its printed text as strings.
 *
 * @implements {Sink}
 */
declare class TextSink implements Sink {
    /** @type {string[]} */
    parts: string[];
    /** @type {boolean} */
    signed: boolean;
    /** Text written before `parts`, set by `fit` to avoid shifting them. @type {string} */
    leading: string;
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
    /**
     * Keep the printed text apart from the text around it: `before` and `after`
     * are the neighbours' adjacent characters.
     *
     * @param {string | undefined} before
     * @param {string | undefined} after
     * @return {void}
     */
    fit(before: string | undefined, after: string | undefined): void;
    /** @return {string} */
    join(): string;
}
export { TextSink };
