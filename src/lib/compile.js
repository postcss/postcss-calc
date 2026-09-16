import { parse } from './parser.js';
import { simplify } from './simplify.js';
import { analyze } from './analyze.js';

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
function compileCandidate(candidate, ctx) {
  if (!candidate.closed) {
    throw new Error(
      `Unclosed ${candidate.name}( at position ${candidate.start}`
    );
  }
  const parsed = parse(
    ctx.tokens,
    candidate.sliceStart,
    candidate.sliceEnd,
    ctx.index
  );
  const analysis = analyze(parsed);
  if (!analysis.valid) {
    throw new Error('Invalid CSS calculation type');
  }
  const tree = simplify(parsed);
  const original =
    analysis.unresolved && !candidate.calculation
      ? ctx.value.slice(candidate.start, candidate.end)
      : undefined;
  return {
    start: candidate.start,
    end: candidate.end,
    result: {
      tree,
      status: analysis.unresolved ? 'unresolved' : 'resolved',
      rootName: candidate.normalizedName,
      rootSpelling: candidate.rootSpelling,
      calculation: candidate.calculation,
      original,
    },
  };
}

/**
 * Compile candidates independently so one malformed calculation is preserved
 * without preventing unrelated candidates from being reduced.
 *
 * @param {Candidate[]} candidates
 * @param {CompileContext} ctx
 * @return {Replacement[]}
 */
function compileCandidates(candidates, ctx) {
  /** @type {Replacement[]} */
  const replacements = [];
  for (const candidate of candidates) {
    try {
      replacements.push(compileCandidate(candidate, ctx));
    } catch (error) {
      ctx.options.onParseError?.(
        error instanceof Error ? error : new Error('Error', { cause: error }),
        ctx.value.slice(candidate.start, candidate.end)
      );
    }
  }
  return replacements;
}

export { compileCandidate, compileCandidates };
