// Token-level reducer. Like `reduce.js` it has no PostCSS dependency; it is
// for callers that already hold a token list and edit it in place. Source
// offsets in the tokens may be stale and are never read. The other fields
// must be consistent, as `tokenize` produces them. Replacement tokens carry
// fresh offsets that are consistent within the replacement.
import { hasPotentialMathFunction } from './lib/functions.js';
import { resolveOptions } from './lib/options.js';
import { reduceTokenList } from './lib/core.js';

/** @typedef {import('./reduce.js').ReduceCalcOptions} ReduceCalcOptions */
/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('./lib/serialize/sink.js').TokenSink} TokenSink */

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
 * @typedef {object} WarnTarget
 * @property {(message: string, plugin?: string) => void} warn
 */

/**
 * Reduce `tokens[start, end)` for the target. Returns the replacements as
 * `reduceTokens` does.
 *
 * @typedef {(tokens: CSSToken[], target: WarnTarget, start?: number, end?: number) => TokenReplacement[]} TokenReducer
 */

/**
 * Check that `[start, end)` names a range of `tokens`.
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
    end > tokens.length
  ) {
    throw new RangeError(
      `Token range [${start}, ${end}) for ${tokens.length} tokens`
    );
  }
}

/**
 * Reduce `tokens[start, end)` with resolved options whose callbacks are set.
 *
 * @param {import('./reduce.js').ResolvedReduceCalcOptions} options
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @return {TokenReplacement[]}
 */
function run(options, tokens, start, end) {
  assertRange(tokens, start, end);
  /** @type {TokenReplacement[]} */
  const replacements = [];
  reduceTokenList(
    tokens,
    options,
    (from, to, printed) => {
      // The reducer asks for tokens, so the printed value is a token sink.
      const sink = /** @type {TokenSink} */ (printed);
      if (sink.identical()) return;
      replacements.push({
        start: from,
        end: to,
        tokens: withOffsets(sink.tokens),
      });
    },
    start,
    end,
    undefined,
    true
  );
  return replacements;
}

/**
 * The tokens with offsets that locate each one in their own joined text, as
 * `tokenize` of that text would give. Reused source tokens are copied, so the
 * source list is never shared with a replacement. The detail objects
 * (`token[4]`) are shared, so a caller must not edit them in place.
 *
 * @param {CSSToken[]} tokens
 * @return {CSSToken[]}
 */
function withOffsets(tokens) {
  let offset = 0;
  return tokens.map((token) => {
    const from = offset;
    offset += token[1].length;
    return /** @type {CSSToken} */ (
      /** @type {unknown} */ ([token[0], token[1], from, offset - 1, token[4]])
    );
  });
}

/**
 * Build a reducer that resolves `opts` once, for a caller that reduces many
 * token lists with the same options. Each call sends its warnings to the
 * target it is given, unless `opts` has `onWarn`, which takes precedence as
 * `onParseError` does.
 *
 * @param {ReduceCalcOptions} [opts]
 * @return {TokenReducer}
 */
function createReducer(opts) {
  const options = resolveOptions(opts);
  return (tokens, target, start = 0, end = tokens.length) =>
    run(
      {
        ...options,
        onWarn:
          options.onWarn ??
          ((/** @type {string} */ message) =>
            target.warn(message, 'postcss-calc')),
        onParseError:
          options.onParseError ??
          ((/** @type {Error} */ error) =>
            target.warn(error.message, 'postcss-calc')),
      },
      tokens,
      start,
      end
    );
}

/** A parse error is dropped when the caller gives no `onParseError`. */
function ignoreParseError() {}

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
function reduceTokens(tokens, opts, start = 0, end = tokens.length) {
  const options = resolveOptions(opts);
  options.onParseError ??= ignoreParseError;
  return run(options, tokens, start, end);
}

export default reduceTokens;
export { createReducer, hasPotentialMathFunction };
