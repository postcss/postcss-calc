export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Node = import('../node.js').Node;
export type OpaqueComponent = import('../node.js').OpaqueComponent;
export type ParseInput = import('./tokens.js').ParseInput;
export type Cursor = import('./tokens.js').Cursor;
export type FunctionToken = import('./tokens.js').FunctionToken;
export type ParseRange = (input: ParseInput, start: number, end: number) => Node;
/** @param {ParseInput} input @param {Cursor} cursor @param {FunctionToken} token @param {string} name @param {string} rawName @param {ParseRange} parseRange @return {Node} */
declare function parseOpaqueCall(input: ParseInput, cursor: Cursor, token: FunctionToken, name: string, rawName: string, parseRange: ParseRange): Node;
/** @param {ParseInput} input @param {Cursor} cursor @param {FunctionToken} token @param {string} name @param {string} rawName @param {ParseRange} parseRange @return {Node} */
declare function parseVar(input: ParseInput, cursor: Cursor, token: FunctionToken, name: string, rawName: string, parseRange: ParseRange): Node;
export { parseOpaqueCall, parseVar };
