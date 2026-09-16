export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Node = import('./node.js').Node;
export type OpaqueComponent = import('./node.js').OpaqueComponent;
export type BlockIndex = ReturnType<typeof import('./block-index.js').indexBlocks>;
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
/** @param {CSSToken[]} tokens @param {number} start @param {number} end @param {BlockIndex} index @return {Node} */
declare function parse(tokens: CSSToken[], start: number, end: number, index: BlockIndex): Node;
export { parse };
