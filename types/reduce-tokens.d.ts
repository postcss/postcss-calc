import { hasPotentialMathFunction } from './lib/functions.js';
export type ReduceCalcOptions = import('./reduce.js').ReduceCalcOptions;
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
/** @typedef {import('./reduce.js').ReduceCalcOptions} ReduceCalcOptions */
/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/**
 * Replace `tokens.slice(start, end)` with `tokens`.
 *
 * @typedef {object} TokenReplacement
 * @property {number} start Index of the first replaced token.
 * @property {number} end Index after the last replaced token.
 * @property {CSSToken[]} tokens
 */
/**
 * Simplify every supported CSS math function in a token list. Returns the
 * replacements that change the text, ordered and non-overlapping, and leaves
 * `tokens` untouched. Apply them from last to first, or build a new list.
 * The replacement tokens come from tokenizing the result text alone, so their
 * source offsets do not describe their place in the list.
 *
 * @param {CSSToken[]} tokens
 * @param {ReduceCalcOptions} [opts]
 * @return {TokenReplacement[]}
 */
declare function reduceTokens(tokens: CSSToken[], opts?: ReduceCalcOptions): TokenReplacement[];
export default reduceTokens;
export { hasPotentialMathFunction };
