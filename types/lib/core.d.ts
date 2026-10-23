export type ResolvedReduceCalcOptions = import('../reduce.js').ResolvedReduceCalcOptions;
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type MathFunction = import('./functions.js').MathFunction;
export type EmitReplacement = (start: number, end: number, text: string) => void;
/**
 * Reduce every supported math function in a token list. Each function is one
 * candidate, so a nested function is never reduced on its own, and an invalid
 * outer function is reported without partial output.
 *
 * Reads each token's type, raw text and parsed value (`token[4]`), never its
 * source offsets (`token[2]`, `token[3]`), so the list may have been edited
 * since it was tokenized.
 *
 * @param {CSSToken[]} tokens
 * @param {ResolvedReduceCalcOptions} options
 * @param {EmitReplacement} emit
 * @param {string} [source] The joined token text, when the caller already has it.
 * @return {void}
 */
declare function reduceTokenList(tokens: CSSToken[], options: ResolvedReduceCalcOptions, emit: EmitReplacement, source?: string): void;
export { reduceTokenList };
