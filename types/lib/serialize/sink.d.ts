import { TokenType } from '@csstools/css-tokenizer';
import { TextSink } from './text-sink.js';
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Sink = TextSink | TokenSink;
/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/**
 * What the printer writes to. `TextSink` and `TokenSink` both implement it, so
 * a method added to one must be added to the other.
 *
 * @typedef {TextSink | TokenSink} Sink
 */
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
 * The output of a printer that builds tokens. `source[start, end)` is the
 * list the printed tokens are compared with: while the printed tokens match
 * it in order, each one is the source token itself. Once one differs, the
 * rest are new tokens with unspecified offsets.
 */
declare class TokenSink {
    /** @type {CSSToken[]} */
    tokens: CSSToken[];
    /** @type {boolean} */
    minusPending: boolean;
    /** @type {boolean} */
    matching: boolean;
    /** @type {number} */
    cursor: number;
    /** @type {CSSToken[]} */ sourceTokens: CSSToken[];
    /** @type {number} */ end: number;
    /**
     * @param {CSSToken[]} source
     * @param {number} start
     * @param {number} end
     */
    constructor(source: CSSToken[], start: number, end: number);
    /**
     * Whether the printed tokens are the source range, token for token.
     *
     * @return {boolean}
     */
    identical(): boolean;
    /**
     * Append the source token at the cursor when it has `type` and raw text
     * `prefix + first + last`. Otherwise the output has diverged for good.
     *
     * @param {TokenType} type
     * @param {string} prefix
     * @param {string} first
     * @param {string} last
     * @return {boolean}
     */
    reuse(type: TokenType, prefix: string, first: string, last: string): boolean;
    /**
     * Write a space when a token starting with `first` would fuse with the
     * token before it.
     *
     * @param {string} first
     * @return {void}
     */
    separate(first: string): void;
    /**
     * Keep the printed tokens apart from the tokens around them: `before` and
     * `after` are the neighbours' adjacent characters. The printed tokens no
     * longer match the source range once a separator is added.
     *
     * @param {string | undefined} before
     * @param {string | undefined} after
     * @return {void}
     */
    fit(before: string | undefined, after: string | undefined): void;
    /** @return {string} The pending sign, or `''`. */
    takeMinus(): string;
    /** A pending sign that no token absorbed is a delimiter. @return {void} */
    flushMinus(): void;
    /**
     * @param {TokenType} type
     * @param {string} raw
     * @param {object | null | undefined} detail
     * @return {void}
     */
    push(type: TokenType, raw: string, detail: object | null | undefined): void;
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
    /** @return {void} */
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
     * @param {TokenType} type
     * @param {string} text
     * @param {string} unit
     * @return {void}
     */
    numeric(type: TokenType, text: string, unit: string): void;
    /**
     * The raw tokens `list[start, end)` of an opaque component. Source tokens
     * are appended by reference, and they keep the cursor only when they start
     * exactly where the printed tokens are.
     *
     * @param {CSSToken[]} list
     * @param {number} start
     * @param {number} end
     * @return {void}
     */
    source(list: CSSToken[], start: number, end: number): void;
}
export { TextSink, TokenSink, decodeIdentifier, numericDetail, sameText };
