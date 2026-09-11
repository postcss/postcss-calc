export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Node = import('./node.js').Node;
export type Component = string | Node | Component[];
export type Token = {
    type: 'number' | 'dimension' | 'ident' | 'function' | 'punct' | 'eof';
    value: string | number;
    raw: string;
    unit?: string;
    rawUnit?: string;
    signCharacter?: '+' | '-';
    pos: number;
    ws: boolean;
};
export type PrefixParselet = (p: Parser, token: Token) => Node;
/** Bounded cursor that skips trivia but records whether it preceded a token. */
declare class Parser {
    #private;
    /**
     * @param {CSSToken[]} tokens
     * @param {number} start
     * @param {number} end
     * @param {Map<number, number>} [ends]
     */
    constructor(tokens: CSSToken[], start: number, end: number, ends?: Map<number, number>);
    /** @return {Map<number, number>} */
    get ends(): Map<number, number>;
    /** @return {number} */
    eofPosition(): number;
    /** @return {Token} */
    read(): Token;
    /** @return {Token} */
    peek(): Token;
    /** @return {Token} */
    next(): Token;
    /** @return {{start: number, close: number, tokens: CSSToken[], ends: Map<number, number>}} */
    functionRange(): {
        start: number;
        close: number;
        tokens: CSSToken[];
        ends: Map<number, number>;
    };
    /** @param {number} index */
    consumeThrough(index: number): void;
    /** @param {string} value @param {string} [value2] @return {boolean} */
    isPunct(value: string, value2?: string): boolean;
    /** @param {string} value @return {boolean} */
    matchPunct(value: string): boolean;
    /** @param {string} value @return {Token} */
    expectPunct(value: string): Token;
    /** @param {number} [minBp] @return {Node} */
    parseExpr(minBp?: number): Node;
}
/** @param {CSSToken[]} tokens @param {number} [start] @param {number} [end] @return {Node} */
declare function parse(tokens: CSSToken[], start?: number, end?: number): Node;
export { parse };
