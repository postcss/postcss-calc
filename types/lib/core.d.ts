import { TokenSink } from './serialize/sink.js';
export type ResolvedReduceCalcOptions = import('../reduce.js').ResolvedReduceCalcOptions;
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Blocks = import('./blocks.js').Blocks;
export type MathFunction = import('./functions.js').MathFunction;
export type EmitReplacement = (start: number, end: number, printed: string | TokenSink) => void;
/**
 * Reduce every supported math function in `tokens[start, end)`. Each function
 * is one candidate, so a nested function is never reduced on its own, and an
 * invalid outer function is reported without partial output. The range reads
 * as the list it names would: a block open at `end` is unclosed, and error
 * offsets count from `start`.
 *
 * Reads each token's type, raw text and parsed value (`token[4]`), never its
 * source offsets (`token[2]`, `token[3]`), so the list may have been edited
 * since it was tokenized. Emitted indices are indices into `tokens`.
 *
 * @param {CSSToken[]} tokens
 * @param {ResolvedReduceCalcOptions} options
 * @param {EmitReplacement} emit
 * @param {number} start
 * @param {number} end
 * @param {string} [source] The joined text of the range, when the caller already has it.
 * @param {boolean} [printTokens] Emit token sinks instead of text.
 * @return {void}
 */
declare function reduceTokenList(tokens: CSSToken[], options: ResolvedReduceCalcOptions, emit: EmitReplacement, start: number, end: number, source?: string, printTokens?: boolean): void;
export { reduceTokenList };
