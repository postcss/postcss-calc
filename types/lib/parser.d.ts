declare const _exports: {
    parse: typeof parse;
};
export = _exports;
export type Token = import('./tokenizer.js').Token;
export type TokenType = import('./tokenizer.js').TokenType;
export type Node = import('./node.js').Node;
export type PrefixParselet = (p: Parser, token: Token) => Node;
export type InfixParselet = {
    lbp: number;
    parse: (p: Parser, left: Node, token: Token) => Node;
};
declare class Parser {
    /** @private */
    i;
    /** @private @readonly */
    tokens;
    /**
     * @param {Token[]} tokens
     */
    constructor(tokens: Token[]);
    /** @return {Token} */
    peek(): Token;
    /** @return {Token} */
    next(): Token;
    /**
     * @param {TokenType} type
     * @param {string} [value]
     * @return {Token}
     */
    expect(type: TokenType, value?: string): Token;
    /**
     * @param {number} [minBp]
     * @return {Node}
     */
    parseExpr(minBp?: number): Node;
}
/**
 * @param {Token[]} tokens
 * @return {Node}
 */
declare function parse(tokens: Token[]): Node;
