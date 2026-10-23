import { TokenType as CssType } from '@csstools/css-tokenizer';
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/**
 * A syntax error at a token. The position is not formatted here: a fallback
 * that fails to parse is discarded, so formatting it would be wasted work.
 * `parse()` formats the position when the error leaves the parser.
 */
declare class ParseError extends Error {
    index: number;
    suffix: string;
    /**
     * @param {string} message Text before the position.
     * @param {number} index Token whose source offset is the position.
     * @param {string} [suffix] Text after the position.
     */
    constructor(message: string, index: number, suffix?: string);
}
/**
 * The error to report for `error`: a parse error gets the position added to
 * its message, and any other error is returned unchanged. The parse error is
 * reused because capturing a second stack trace dominates the cost of a
 * reported failure.
 *
 * @param {Error} error
 * @param {(index: number) => number} offsetOf Offset lookup for the list.
 * @return {Error}
 */
declare function positionedError(error: Error, offsetOf: (index: number) => number): Error;
/** @param {CssType} type @return {boolean} */
declare function isTrivia(type: CssType): boolean;
export type ParseState = {
    tokens: CSSToken[];
    close: Int32Array;
    /**
     * First token of the range, for the leading-whitespace rule.
     */
    start: number;
    /**
     * Exclusive bound.
     */
    end: number;
    pos: number;
};
/**
 * Index of the next token that is not trivia, or `state.end`.
 *
 * @param {ParseState} state
 * @return {number}
 */
declare function peek(state: ParseState): number;
/**
 * @param {CSSToken[]} tokens
 * @param {Int32Array} close
 * @param {number} start
 * @param {number} end
 * @return {ParseState}
 */
declare function newState(tokens: CSSToken[], close: Int32Array, start: number, end: number): ParseState;
/**
 * The text a parse error shows for an expression token, as
 * `Expected ) ... got "..."`. Numbers show their value without the unit, and
 * names their decoded value.
 *
 * @param {CSSToken} token
 * @return {string}
 */
declare function tokenValue(token: CSSToken): string;
/**
 * Read the operator at `index` and check that it is surrounded by whitespace.
 *
 * @param {ParseState} state
 * @param {number} index
 * @return {void}
 */
declare function requireSurroundingWhitespace(state: ParseState, index: number): void;
/**
 * Read a numeric token that carries an explicit sign directly after an
 * operand. Such a token is rejected: the sign must be a separate operator.
 *
 * @param {ParseState} state
 * @return {void}
 */
declare function rejectSignedNumber(state: ParseState): void;
export { ParseError, isTrivia, positionedError, newState, peek, rejectSignedNumber, requireSurroundingWhitespace, tokenValue, };
