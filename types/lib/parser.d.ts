import { indexBlocks } from './block-index.js';
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Node = import('./node.js').Node;
export type OpaqueComponent = import('./node.js').OpaqueComponent;
export type BlockIndex = import('./block-index.js').BlockIndex;
export type Token = {
    type: 'number' | 'dimension' | 'ident' | 'function' | 'punct' | 'eof';
    value: string | number;
    raw: string;
    unit?: string;
    rawUnit?: string;
    signCharacter?: '+' | '-';
    pos: number;
    ws: boolean;
    index: number;
};
export type ParseInput = Readonly<{
    tokens: CSSToken[];
    end: number;
    index: BlockIndex;
}>;
export type PrefixParselet = (input: ParseInput, cursor: Cursor, token: Token, depth: number) => Node;
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
/** @param {CSSToken[]} tokens @param {number} [start] @param {number} [end] @param {BlockIndex} [index] @return {Node} */
declare function parse(tokens: CSSToken[], start?: number, end?: number, index?: BlockIndex): Node;
export { indexBlocks, parse };
