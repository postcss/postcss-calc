// CSS component-value reducer. This module deliberately has no PostCSS
// dependency so it can also be used for individual declaration values,
// at-rule parameters, or selector text.
import { tokenize as cssTokenize } from '@csstools/css-tokenizer';
import { hasPotentialMathFunction } from './lib/functions.js';
import { resolveOptions } from './lib/options.js';
import { reduceTokenList } from './lib/core.js';
import { TextSink as TextSinkClass } from './lib/serialize/text-sink.js';

/**
 * @typedef {object} ReduceCalcOptions
 * @property {number | false} [precision]
 * @property {boolean} [warnWhenCannotResolve]
 * @property {boolean} [unwrapSingleNegativeNumber] Deprecated alias for `unwrapSingleValue`.
 * @property {boolean} [unwrapSingleValue] Serialize fully resolved finite scalar results without calculation syntax. Defaults to `false`.
 * @property {(error: Error, input: string) => void} [onParseError] Invoked when parse/simplify throws.
 * @property {(message: string) => void} [onWarn] Invoked when `warnWhenCannotResolve` is set and an expression cannot be reduced to a single value.
 */

/**
 * The callbacks of `ReduceCalcOptions`. A reducer call receives them apart from
 * the options that shape the result.
 *
 * @typedef {Pick<ReduceCalcOptions, 'onParseError' | 'onWarn'>} ReduceDiagnostics
 */

/** @typedef {Required<Omit<ReduceCalcOptions, 'onParseError' | 'onWarn'>>} ResolvedReduceCalcOptions */

/** @typedef {import('./lib/serialize/text-sink.js').TextSink} TextSink */

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

  const options = resolveOptions(opts);
  /** @type {ReduceDiagnostics} */
  const diagnostics = {
    onWarn: opts?.onWarn,
    onParseError: opts?.onParseError,
  };
  /** @type {import('@csstools/css-tokenizer').CSSToken[]} */
  let tokens;
  try {
    tokens = cssTokenize({ css: value });
  } catch (error) {
    diagnostics.onParseError?.(
      error instanceof Error ? error : new Error('Error', { cause: error }),
      value
    );
    return value;
  }

  // The tokens are fresh, so their offsets locate each range in `value`.
  let output = '';
  let lastIndex = 0;
  let changed = false;
  reduceTokenList(
    tokens,
    options,
    diagnostics,
    {
      createSink: () => new TextSinkClass(),
      emit: (start, end, printed) => {
        const text = printed.join();
        const from = tokens[start][2];
        const to = tokens[end - 1][3] + 1;
        if (to - from === text.length && value.startsWith(text, from)) return;
        output += value.slice(lastIndex, from) + text;
        lastIndex = to;
        changed = true;
      },
    },
    0,
    tokens.length,
    value
  );
  return changed ? output + value.slice(lastIndex) : value;
}

export default reduceCalc;
