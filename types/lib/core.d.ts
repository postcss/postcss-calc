export type ResolvedReduceCalcOptions = import('../reduce.js').ResolvedReduceCalcOptions;
export type ReduceDiagnostics = import('../reduce.js').ReduceDiagnostics;
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type Blocks = import('./blocks.js').Blocks;
export type MathFunction = import('./functions.js').MathFunction;
export type Sink = import('./serialize/sink.js').Sink;
export type ReplacementTarget<S extends Sink> = {
    createSink: (start: number, end: number) => S;
    emit: (start: number, end: number, printed: S) => void;
};
/**
 * Reduce every supported math function in `tokens[start, end)`. Each function
 * is one candidate, so a nested function is never reduced on its own, and an
 * invalid outer function is reported without partial output. Blocks and
 * error offsets read the range as the list it names would: a block open at
 * `end` is unclosed, and error offsets count from `start`. The one exception
 * is the token on each side of a replacement, which may lie outside the range:
 * a replacement gets a space when it would fuse with it.
 *
 * Reads each token's type, raw text and parsed value (`token[4]`), never its
 * source offsets (`token[2]`, `token[3]`), so the list may have been edited
 * since it was tokenized. Emitted indices are indices into `tokens`.
 *
 * @template {Sink} S
 * @param {CSSToken[]} tokens
 * @param {ResolvedReduceCalcOptions} options Shared by every call; never changed.
 * @param {ReduceDiagnostics} diagnostics Warnings and parse errors for this call.
 * @param {ReplacementTarget<S>} target
 * @param {number} start
 * @param {number} end
 * @param {string} [source] The joined text of the range, when the caller already has it.
 * @return {void}
 */
declare function reduceTokenList<S extends Sink>(tokens: CSSToken[], options: ResolvedReduceCalcOptions, diagnostics: ReduceDiagnostics, target: ReplacementTarget<S>, start: number, end: number, source?: string): void;
export { reduceTokenList };
