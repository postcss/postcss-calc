export type ResolvedReduceCalcOptions = import('../reduce.js').ResolvedReduceCalcOptions;
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type MathFunction = import('./functions.js').MathFunction;
export type EmitReplacement = (start: number, end: number, text: string) => void;
/**
 * Reduce every supported math function in a token list. Each function is one
 * candidate, so a nested function is never reduced on its own, and an invalid
 * outer function is reported without partial output.
 *

 * @param {CSSToken[]} tokens
 * @param {ResolvedReduceCalcOptions} options
 * @param {EmitReplacement} emit
 * @param {string} source The joined token text.
 * @return {void}
 */
declare function reduceTokenList(tokens: CSSToken[], options: ResolvedReduceCalcOptions, emit: EmitReplacement, source: string): void;
export { reduceTokenList };
