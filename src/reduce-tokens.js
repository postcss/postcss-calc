// Token-level reducer. Like `reduce.js` it has no PostCSS dependency; it is
// for callers that already hold a token list and edit it in place. Source
// offsets in the tokens may be stale and are never read. The other fields
// must be consistent, as `tokenize` produces them. Replacement tokens carry
// fresh offsets that are consistent within the replacement.
import { hasPotentialMathFunction } from './lib/functions.js';
import { resolveOptions } from './lib/options.js';
import { reduceTokenList } from './lib/core.js';
import { TokenSink } from './lib/serialize/sink.js';

/** @typedef {import('./reduce.js').ReduceCalcOptions} ReduceCalcOptions */
/** @typedef {import('./reduce.js').ReduceDiagnostics} ReduceDiagnostics */
/** @typedef {import('./reduce.js').ResolvedReduceCalcOptions} ResolvedReduceCalcOptions */
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
 * Where a reducer sends its warnings and parse errors. A parse error reaches
 * `warn` only when the reducer has no `onParseError` option.
 *
 * The target has PostCSS's `Result.warn(text, opts)` shape, so a PostCSS
 * `Result` can be passed directly.
 *
 * @typedef {object} WarnTarget
 * @property {(message: string, opts?: { plugin?: string }) => void} warn
 */

/**
 * Reduce `tokens[start, end)` for the target. Returns the replacements as
 * `reduceTokens` does.
 *
 * @typedef {(tokens: CSSToken[], target: WarnTarget, start?: number, end?: number) => TokenReplacement[]} TokenReducer
 */

/**
 * Check that `start` and `end` are indices into `tokens`, with `start` and
 * `end` each in `[0, tokens.length]`. An inverted range passes this check.
 *
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @return {void}
 */
function assertRange(tokens, start, end) {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < 0 ||
    start > tokens.length ||
    end > tokens.length
  ) {
    throw new RangeError(
      `Token range [${start}, ${end}) for ${tokens.length} tokens`
    );
  }
}

/**
 * Reduce `tokens[start, end)` with the resolved options and diagnostics of
 * one call.
 *
 * @param {ResolvedReduceCalcOptions} options
 * @param {ReduceDiagnostics} diagnostics
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @return {TokenReplacement[]}
 */
function run(options, diagnostics, tokens, start, end) {
  assertRange(tokens, start, end);
  // An empty or inverted range names no tokens, so it has no replacements.
  if (start >= end) return [];
  /** @type {TokenReplacement[]} */
  const replacements = [];
  reduceTokenList(
    tokens,
    options,
    diagnostics,
    {
      createSink: (from, to) => new TokenSink(tokens, from, to),
      emit: (from, to, sink) => {
        if (sink.identical()) return;
        replacements.push({
          start: from,
          end: to,
          tokens: sink.build(),
        });
      },
    },
    start,
    end
  );
  return replacements;
}

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
function createReducer(opts) {
  const options = resolveOptions(opts);
  return (tokens, target, start = 0, end = tokens.length) => {
    /** @type {ReduceDiagnostics} */
    const diagnostics = {
      onWarn:
        opts?.onWarn ??
        ((message) => target.warn(message, { plugin: 'postcss-calc' })),
      onParseError:
        opts?.onParseError ??
        ((error) => target.warn(error.message, { plugin: 'postcss-calc' })),
    };
    return run(options, diagnostics, tokens, start, end);
  };
}

/** A parse error is dropped when the caller gives no `onParseError`. */
function ignoreParseError() {}

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
function reduceTokens(tokens, opts, start = 0, end = tokens.length) {
  const options = resolveOptions(opts);
  /** @type {ReduceDiagnostics} */
  const diagnostics = {
    onWarn: opts?.onWarn,
    onParseError: opts?.onParseError ?? ignoreParseError,
  };
  return run(options, diagnostics, tokens, start, end);
}

export default reduceTokens;
export { createReducer, hasPotentialMathFunction };
