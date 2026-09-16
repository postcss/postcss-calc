// CSS component-value reducer. This module deliberately has no PostCSS
// dependency so it can also be used for individual declaration values,
// at-rule parameters, or selector text.
import { tokenize as cssTokenize } from '@csstools/css-tokenizer';
import { indexBlocks } from './lib/block-index.js';
import { hasPotentialMathFunction } from './lib/functions.js';
import { assertDepth } from './lib/limits.js';
import { findCalculations } from './lib/scan.js';
import { compileCandidates } from './lib/compile.js';
import { applyReplacements } from './lib/print.js';

/**
 * @typedef {object} ReduceCalcOptions
 * @property {number | false} [precision]
 * @property {boolean} [warnWhenCannotResolve]
 * @property {boolean} [unwrapSingleNegativeNumber] Deprecated alias for `unwrapSingleValue`.
 * @property {boolean} [unwrapSingleValue] Serialize fully resolved finite scalar results without calculation syntax. Defaults to `false`.
 * @property {(error: Error, input: string) => void} [onParseError] Invoked when parse/simplify throws.
 * @property {(message: string) => void} [onWarn] Invoked when `warnWhenCannotResolve` is set and an expression cannot be reduced to a single value.
 */

/** @typedef {Required<Omit<ReduceCalcOptions, 'onParseError' | 'onWarn'>> & Pick<ReduceCalcOptions, 'onParseError' | 'onWarn'>} ResolvedReduceCalcOptions */

/**
 * Fields threaded through the internal token-range walk.
 *
 * @typedef {object} TransformContext
 * @property {ResolvedReduceCalcOptions} options
 * @property {string} value
 * @property {import('@csstools/css-tokenizer').CSSToken[]} tokens
 */

/**
 * @typedef {object} Replacement
 * @property {number} start
 * @property {number} end
 * @property {CalculationResult} result
 */
/**
 * @typedef {object} CalculationResult
 * @property {import('./lib/node.js').Node} tree
 * @property {'resolved' | 'unresolved'} status
 * @property {string} rootName
 * @property {string} rootSpelling
 * @property {boolean} calculation
 * @property {string | undefined} original
 */

/**
 * Simplify every supported CSS math function in a component-value string.
 * Text outside those functions is preserved byte-for-byte.
 *
 * @param {string} value
 * @param {ReduceCalcOptions} [opts]
 * @return {string}
 */
function reduceCalc(value, opts) {
  if (!hasPotentialMathFunction(value)) {
    return value;
  }

  /** @type {ResolvedReduceCalcOptions} */
  const options = {
    precision: 5,
    warnWhenCannotResolve: false,
    unwrapSingleNegativeNumber: false,
    unwrapSingleValue: false,
    ...opts,
  };
  /** @type {import('@csstools/css-tokenizer').CSSToken[]} */
  let tokens;
  /** @type {ReturnType<typeof indexBlocks>} */
  let index;
  try {
    tokens = cssTokenize({ css: value });
    index = indexBlocks(tokens);
    assertDepth(index.maxDepth);
  } catch (error) {
    options.onParseError?.(
      error instanceof Error ? error : new Error('Error', { cause: error }),
      value
    );
    return value;
  }

  const candidates = findCalculations(value, tokens, index);
  const replacements = compileCandidates(candidates, {
    options,
    value,
    tokens,
    index,
  });
  if (replacements.length === 0) {
    return value;
  }
  const serializationOptions = {
    precision: options.precision,
    unwrapSingleNegativeNumber: options.unwrapSingleNegativeNumber,
    unwrapSingleValue: options.unwrapSingleValue,
  };
  return applyReplacements(value, replacements, options, serializationOptions);
}

export default reduceCalc;
