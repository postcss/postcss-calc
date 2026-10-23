// Token-level reducer. Like `reduce.js` it has no PostCSS dependency; it is
// for callers that already hold a token list and edit it in place. Source
// offsets in the tokens may be stale and are never read. The other fields
// must be consistent, as `tokenize` produces them.
import { tokenize as cssTokenize, TokenType } from '@csstools/css-tokenizer';
import { hasPotentialMathFunction } from './lib/functions.js';
import { tokensMatchText } from './lib/offsets.js';
import { resolveOptions } from './lib/options.js';
import { reduceTokenList } from './lib/core.js';

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
function reduceTokens(tokens, opts) {
  const options = resolveOptions(opts);
  /** @type {TokenReplacement[]} */
  const replacements = [];
  reduceTokenList(tokens, options, (start, end, text) => {
    if (tokensMatchText(tokens, start, end, text)) return;
    const result = cssTokenize({ css: text });
    if (result.at(-1)?.[0] === TokenType.EOF) result.pop();
    replacements.push({ start, end, tokens: result });
  });
  return replacements;
}

export default reduceTokens;
export { hasPotentialMathFunction };
