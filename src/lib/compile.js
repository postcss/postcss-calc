import { parse } from './parser.js';
import { simplify } from './simplify.js';
import { analyze } from './analyze.js';

/** @typedef {import('./scan.js').Candidate} Candidate */
/** @typedef {import('../reduce.js').ResolvedReduceCalcOptions} ResolvedReduceCalcOptions */
/** @typedef {import('../reduce.js').Replacement} Replacement */
/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('./block-index.js').BlockIndex} BlockIndex */
/** @typedef {{options: ResolvedReduceCalcOptions, value: string, tokens: CSSToken[], index: BlockIndex}} CompileContext */

class CalculationTypeError extends Error {
  constructor() {
    super('Invalid CSS calculation type');
    this.name = 'CalculationTypeError';
  }
}

/**
 * Parse, analyze, and simplify one candidate.
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
    throw new CalculationTypeError();
  }
  const tree = simplify(parsed);
  const original = ctx.value.slice(candidate.start, candidate.end);
  return {
    start: candidate.start,
    end: candidate.end,
    result: {
      tree,
      status: analysis.unresolved ? 'unresolved' : 'resolved',
      rootName: candidate.name,
      rootSpelling: candidate.rootSpelling,
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

export { CalculationTypeError, compileCandidate, compileCandidates };
