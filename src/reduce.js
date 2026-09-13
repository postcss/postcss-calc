// CSS component-value reducer. This module deliberately has no PostCSS
// dependency so it can also be used for individual declaration values,
// at-rule parameters, or selector text.
import {
  tokenize as cssTokenize,
  TokenType as CssType,
} from '@csstools/css-tokenizer';
import { indexBlocks, parse } from './lib/parser.js';
import { simplify } from './lib/simplify.js';
import {
  isSupportedMathFunction,
  hasPotentialMathFunction,
  QUICK_MATH_TEST,
} from './lib/simplify/call.js';
import { serializeResult } from './lib/serialize.js';
import {
  MAX_CALCULATION_DEPTH,
  CalculationLimitError,
  checkCalculationType,
} from './lib/calculation-type.js';

const MATCH_CALC = /^(?:-(?:moz|webkit)-)?calc$/i;

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
 * @property {Replacement[]} replacements
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
 * @property {string} original
 */

class CalculationTypeError extends Error {
  constructor() {
    super('Invalid CSS calculation type');
    this.name = 'CalculationTypeError';
  }
}

/** @param {unknown} error @return {Error} */
function normalizeCalculationError(error) {
  if (error instanceof RangeError) {
    return new CalculationLimitError(MAX_CALCULATION_DEPTH);
  }
  return error instanceof Error ? error : new Error('Error');
}

/**
 * Walk the indexed component values. A supported function is treated as one
 * opaque calculation even when parsing it fails.
 *
 * @param {TransformContext} ctx
 * @param {{ends: Map<number, number>, maxDepth: number}} index
 * @return {void}
 */
function collectReplacements(ctx, index) {
  for (let i = 0; i < ctx.tokens.length; i++) {
    const token = ctx.tokens[i];
    if (token[0] !== CssType.Function) continue;

    const name = token[4].value;
    const isCalc = MATCH_CALC.test(name);
    const isMath = !isCalc && isSupportedMathFunction(name);
    if (!isCalc && !isMath) continue;

    const close = index.ends.get(i);
    const closed = close !== undefined;
    const end = closed ? ctx.tokens[close][3] + 1 : ctx.value.length;
    const sliceStart = isCalc ? i + 1 : i;
    const sliceEnd = closed ? close + (isCalc ? 0 : 1) : ctx.tokens.length - 1;
    try {
      if (!closed) {
        throw new Error(`Unclosed ${name}( at position ${token[2]}`);
      }
      const parsed = parse(ctx.tokens, sliceStart, sliceEnd, index);
      if (checkCalculationType(parsed).kind === 'failure') {
        throw new CalculationTypeError();
      }
      const node = simplify(parsed);
      const original = ctx.value.slice(token[2], end);
      const resultType = checkCalculationType(node);
      ctx.replacements.push({
        start: token[2],
        end,
        result: {
          tree: node,
          status:
            resultType.kind === 'unknown' || isUnresolvedResult(node)
              ? 'unresolved'
              : 'resolved',
          rootName: name,
          rootSpelling: ctx.value.slice(token[2], token[3]),
          original,
        },
      });
    } catch (error) {
      const err = normalizeCalculationError(error);
      const original = ctx.value.slice(token[2], end);
      ctx.options.onParseError?.(err, original);
    }
    if (!closed) return;
    i = close;
  }
}

/**
 * @param {import('./lib/node.js').Node} node
 * @return {boolean}
 */
function isUnresolvedResult(node) {
  if (node.type === 'Sum' || node.type === 'Product' || node.type === 'Ident') {
    return true;
  }
  return node.type === 'Call' && isSupportedMathFunction(node.name);
}

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
  const tokens = cssTokenize({ css: value });
  const index = indexBlocks(tokens);
  /** @type {Replacement[]} */
  const replacements = [];
  try {
    if (index.maxDepth > MAX_CALCULATION_DEPTH) {
      throw new CalculationLimitError(MAX_CALCULATION_DEPTH);
    }
    collectReplacements({ options, value, tokens, replacements }, index);
  } catch (error) {
    const err = normalizeCalculationError(error);
    options.onParseError?.(err, value);
    return value;
  }

  if (replacements.length === 0) {
    return value;
  }

  let output = '';
  let lastIndex = 0;
  for (const replacement of replacements) {
    let text;
    try {
      text = serializeResult(replacement.result, {
        precision: options.precision,
        unwrapSingleNegativeNumber: options.unwrapSingleNegativeNumber,
        unwrapSingleValue: options.unwrapSingleValue,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Error');
      options.onParseError?.(err, replacement.result.original);
      text = replacement.result.original;
    }
    if (
      options.warnWhenCannotResolve &&
      replacement.result.status === 'unresolved'
    ) {
      options.onWarn?.('Could not reduce expression: ' + value);
    }
    output += value.slice(lastIndex, replacement.start) + text;
    lastIndex = replacement.end;
  }
  output += value.slice(lastIndex);
  return output;
}

export { QUICK_MATH_TEST, hasPotentialMathFunction };
export default reduceCalc;
