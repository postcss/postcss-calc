export type Candidate = import('./scan.js').Candidate;
export type ResolvedReduceCalcOptions = import('../reduce.js').ResolvedReduceCalcOptions;
export type Replacement = import('../reduce.js').Replacement;
export type CSSToken = import('@csstools/css-tokenizer').CSSToken;
export type BlockIndex = ReturnType<typeof import('./block-index.js').indexBlocks>;
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
/** @typedef {ReturnType<typeof import('./block-index.js').indexBlocks>} BlockIndex */
/** @typedef {{options: ResolvedReduceCalcOptions, value: string, tokens: CSSToken[], index: BlockIndex}} CompileContext */
/**
 * Parse, analyze, and simplify one candidate. Analysis is the validity/status
 * gate over the original tree; simplification then runs independently as a
 * composable AST transformation that may synthesize nodes.
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
export { compileCandidate, compileCandidates };
