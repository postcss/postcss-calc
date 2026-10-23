import { hasPotentialMathFunction } from './lib/functions.js';
export type ReduceCalcOptions = import('./reduce.js').ReduceCalcOptions;
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type TokenSink = import('./lib/serialize/sink.js').TokenSink;
export type TokenReplacement = {
    /**
     * Index of the first replaced token.
     */
    start: number;
    /**
     * Index after the last replaced token.
     */
    end: number;
    tokens: CSSToken[];
};
export type WarnTarget = {
    warn: (message: string, plugin?: string) => void;
};
export type TokenReducer = (tokens: CSSToken[], target: WarnTarget, start?: number, end?: number) => TokenReplacement[];
/**
 * Build a reducer that resolves `opts` once, for a caller that reduces many
 * token lists with the same options. Each call sends its warnings to the
 * target it is given, unless `opts` has `onWarn`, which takes precedence as
 * `onParseError` does.
 *
 * @param {ReduceCalcOptions} [opts]
 * @return {TokenReducer}
 */
declare function createReducer(opts?: ReduceCalcOptions): TokenReducer;
/**
 * Simplify every supported CSS math function in `tokens[start, end)`. Returns
 * the replacements that change the text, ordered and non-overlapping, and
 * leaves `tokens` untouched. Apply them from last to first, or build a new
 * list. Replacement indices are indices into `tokens`, and a range reads as
 * the list it names would. The offsets of a replacement's tokens locate them
 * in the replacement's own text, counting from 0. An empty or inverted
 * range has no replacements. Throws a `RangeError` for a range that is not
 * within `tokens`.
 *
 * @param {CSSToken[]} tokens
 * @param {ReduceCalcOptions} [opts]
 * @param {number} [start]
 * @param {number} [end]
 * @return {TokenReplacement[]}
 */
declare function reduceTokens(tokens: CSSToken[], opts?: ReduceCalcOptions, start?: number, end?: number): TokenReplacement[];
export default reduceTokens;
export { createReducer, hasPotentialMathFunction };
