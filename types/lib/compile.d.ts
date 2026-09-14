export type Candidate = import('./scan.js').Candidate;
export type ResolvedReduceCalcOptions = import('../reduce.js').ResolvedReduceCalcOptions;
export type Replacement = import('../reduce.js').Replacement;
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type BlockIndex = import('./block-index.js').BlockIndex;
export type CompileContext = {
    options: ResolvedReduceCalcOptions;
    value: string;
    tokens: CSSToken[];
    index: BlockIndex;
};
/** @typedef {import('./scan.js').Candidate} Candidate */
/** @typedef {import('../reduce.js').ResolvedReduceCalcOptions} ResolvedReduceCalcOptions */
/** @typedef {import('../reduce.js').Replacement} Replacement */
/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('./block-index.js').BlockIndex} BlockIndex */
/** @typedef {{options: ResolvedReduceCalcOptions, value: string, tokens: CSSToken[], index: BlockIndex}} CompileContext */
declare class CalculationTypeError extends Error {
    constructor();
}
/**
 * Parse, analyze, and simplify one candidate.
 *
 * @param {Candidate} candidate
 * @param {CompileContext} ctx
 * @return {Replacement}
 */
declare function compileCandidate(candidate: Candidate, ctx: CompileContext): Replacement;
/**
 * Compile candidates independently so one malformed calculation is preserved
 * without preventing unrelated candidates from being reduced.
 *
 * @param {Candidate[]} candidates
 * @param {CompileContext} ctx
 * @return {Replacement[]}
 */
declare function compileCandidates(candidates: Candidate[], ctx: CompileContext): Replacement[];
export { CalculationTypeError, compileCandidate, compileCandidates };
