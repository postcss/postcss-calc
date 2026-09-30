export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Node = import('./node.js').Node;
export type BlockIndex = import('./parser/tokens.js').BlockIndex;
export type ParseInput = import('./parser/tokens.js').ParseInput;
export type Token = import('./parser/tokens.js').Token;
export type FunctionToken = import('./parser/tokens.js').FunctionToken;
/** @param {CSSToken[]} tokens @param {number} start @param {number} end @param {BlockIndex} index @return {Node} */
declare function parse(tokens: CSSToken[], start: number, end: number, index: BlockIndex): Node;
export { parse };
