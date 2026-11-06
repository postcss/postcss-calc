import { TokenType } from '@csstools/css-tokenizer';
import { TextSink } from './text-sink.js';
import { decodeIdentifier, numericDetail, sameText } from './token-values.js';
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Sink = {
    open: () => void;
    close: () => void;
    comma: () => void;
    op: (operator: '+' | '-' | '*' | '/') => void;
    minus: () => void;
    fn: (name: string) => void;
    ident: (raw: string) => void;
    number: (text: string) => void;
    dimension: (text: string, unit: string) => void;
    source: (list: CSSToken[], start: number, end: number) => void;
    fit: (before: string | undefined, after: string | undefined) => void;
};
export type Piece = number | CSSToken;
/**
 * The output of a printer that builds tokens. The printed pieces are compared
 * with the source range `[start, end)`: when they are that range's non-EOF
 * tokens in order, each one a source index, the output is the source range
 * unchanged. Tokens are only built, and copied, by `build`.
 *
 * EOF tokens take no part in matching, because printed output never holds
 * them.
 *
 * @implements {Sink}
 */
declare class TokenSink implements Sink {
    /** @type {Piece[]} */
    pieces: Piece[];
    /** @type {boolean} */
    minusPending: boolean;
    /** @type {CSSToken[]} */ sourceTokens: CSSToken[];
    /** @type {number} */ start: number;
    /** @type {number} */ end: number;
    /**
     * @param {CSSToken[]} source
     * @param {number} start
     * @param {number} end
     */
    constructor(source: CSSToken[], start: number, end: number);
    /**
     * The source index that the next printed token must have to be reused, or
     * -1 once the output has diverged. Only the last piece decides: a built
     * token ends reuse, and every later token is built too.
     *
     * @return {number}
     */
    expectedIndex(): number;
    /**
     * Whether the pieces are the source range, token for token.
     *
     * @return {boolean}
     */
    identical(): boolean;
    /**
     * The tokens of the output. Each one carries offsets that locate it in the
     * output text, counting from 0, and a copied parsed value, so the result
     * shares no object with the source list.
     *
     * @return {CSSToken[]}
     */
    build(): CSSToken[];
    /**
     * The text of a piece.
     *
     * @param {Piece} piece
     * @return {string}
     */
    textOf(piece: Piece): string;
    /**
     * Append the source token at the expected index when it has `type` and raw
     * text `prefix + first + last`. Returns false otherwise, and the caller
     * builds the token.
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
     * `after` are the neighbours' adjacent characters. Added separators are
     * built tokens, so the output no longer matches the source range.
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
     * of the sink's own list are reused by index when the range starts at the
     * expected index; any other token is kept by reference as a built token.
     *
     * @param {CSSToken[]} list
     * @param {number} start
     * @param {number} end
     * @return {void}
     */
    source(list: CSSToken[], start: number, end: number): void;
}
export { TextSink, TokenSink, decodeIdentifier, numericDetail, sameText };
