import { hasPotentialMathFunction } from './lib/functions.js';
export type ReduceCalcOptions = import('./reduce.js').ReduceCalcOptions;
export type ReduceDiagnostics = import('./reduce.js').ReduceDiagnostics;
export type ResolvedReduceCalcOptions = import('./reduce.js').ResolvedReduceCalcOptions;
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
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
    warn: (message: string, opts?: {
        plugin?: string;
    }) => void;
};
export type TokenReducer = (tokens: CSSToken[], target: WarnTarget, start?: number, end?: number) => TokenReplacement[];
/**
 * Build a reducer that resolves `opts` once, for a caller that reduces many
 * token lists with the same options.
 *
 * Each call sends its warnings and parse errors to the `target` it is given.
 * An `onWarn` or `onParseError` option takes precedence over the target.
 *
 * @param {ReduceCalcOptions} [opts]
 * @return {TokenReducer}
 */
declare function createReducer(opts?: ReduceCalcOptions): TokenReducer;
/**
 * Simplify every supported CSS math function in `tokens[start, end)`.
 *
 * Returns the replacements that change the text, ordered and non-overlapping.
 * `tokens` is left untouched: apply the replacements from last to first, or
 * build a new list.
 *
 * Replacement indices are indices into `tokens`. A range reads as the list it
 * names would, with one exception: the token on each side of a replacement is
 * read even when it lies outside the range, because a replacement that would
 * fuse with it starts or ends with a whitespace token. EOF tokens in the list
 * are skipped.
 *
 * The offsets of a replacement's tokens locate them in the replacement's own
 * text, counting from 0. An empty or inverted range has no replacements.
 *
 * Throws a `RangeError` for a range that is not within `tokens`. A parse error
 * is dropped unless `opts.onParseError` is set, as the standalone reducer drops
 * warnings by default. `createReducer` sends it to its target instead.
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
