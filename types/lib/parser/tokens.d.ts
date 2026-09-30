export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type BlockIndex = ReturnType<typeof import('../block-index.js').indexBlocks>;
export type TokenBase = {
    raw: string;
    pos: number;
    ws: boolean;
    index: number;
};
export type NumberToken = TokenBase & {
    type: 'number';
    value: number;
    signCharacter?: '+' | '-';
};
export type DimensionToken = TokenBase & {
    type: 'dimension';
    value: number;
    unit: string;
    rawUnit: string;
    signCharacter?: '+' | '-';
};
export type IdentToken = TokenBase & {
    type: 'ident';
    value: string;
};
export type FunctionToken = TokenBase & {
    type: 'function';
    value: string;
};
export type Punctuator = '(' | ')' | ',' | '+' | '-' | '*' | '/';
export type PunctToken = TokenBase & {
    type: 'punct';
    value: Punctuator;
};
export type EofToken = TokenBase & {
    type: 'eof';
    value: '';
    raw: '';
};
export type Token = NumberToken | DimensionToken | IdentToken | FunctionToken | PunctToken | EofToken;
export type ParseInput = Readonly<{
    tokens: CSSToken[];
    end: number;
    index: BlockIndex;
}>;
/** @param {string} raw @param {string} decoded */
declare function sourceSpelling(raw: string, decoded: string): string | undefined;
/**
 * Mutable navigation state only. `index` is always the next native token
 * position; trivia is intentionally left visible to `scanToken`.
 */
declare class Cursor {
    /** @type {number} */
    index: number;
    /** @type {boolean} */
    firstToken: boolean;
    /** @type {Token | null} */
    lookahead: Token | null;
    /** @type {number} */
    lookaheadNextIndex: number;
    /** @param {number} start */
    constructor(start: number);
    /** @param {number} index @return {void} */
    skipTo(index: number): void;
}
/** @param {ParseInput} input @param {number} index @return {number} */
declare function eofPositionAt(input: ParseInput, index: number): number;
/** @param {ParseInput} input @param {Cursor} cursor @return {Token} */
declare function peekToken(input: ParseInput, cursor: Cursor): Token;
/**
 * Consume the cached token and advance to its native next index. This is one
 * of the only two operations allowed to advance `cursor.index`.
 * @param {ParseInput} input
 * @param {Cursor} cursor
 * @return {Token}
 */
declare function takeToken(input: ParseInput, cursor: Cursor): Token;
/** @param {ParseInput} input @param {Cursor} cursor @param {Punctuator} value @param {Punctuator} [value2] @return {boolean} */
declare function isPunct(input: ParseInput, cursor: Cursor, value: Punctuator, value2?: Punctuator): boolean;
/** @param {ParseInput} input @param {Cursor} cursor @param {Punctuator} value @return {boolean} */
declare function matchPunct(input: ParseInput, cursor: Cursor, value: Punctuator): boolean;
/** @param {ParseInput} input @param {Cursor} cursor @param {Punctuator} value @return {PunctToken} */
declare function expectPunct(input: ParseInput, cursor: Cursor, value: Punctuator): PunctToken;
export { Cursor, eofPositionAt, expectPunct, isPunct, matchPunct, peekToken, sourceSpelling, takeToken, };
