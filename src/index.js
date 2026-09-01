// PostCSS adapter. Walks declaration values (and optionally @rule params
// and selectors), feeds calc() bodies through tokenize → parse → simplify
// → serialize, and writes the result back.
import {
  tokenize as cssTokenize,
  TokenType as CssType,
} from '@csstools/css-tokenizer';
import { tokenizeTokens } from './lib/tokenizer.js';
import { parse } from './lib/parser.js';
import { simplify } from './lib/simplify.js';
import { isSupportedMathFunction } from './lib/simplify/call.js';
import { serialize } from './lib/serialize.js';

const MATCH_CALC = /^(?:-(?:moz|webkit)-)?calc$/i;

const BLOCK_CLOSE = new Map([
  [CssType.OpenParen, CssType.CloseParen],
  [CssType.OpenSquare, CssType.CloseSquare],
  [CssType.OpenCurly, CssType.CloseCurly],
]);

/**
 * @typedef {object} TransformValueOptions
 * @property {number | false} [precision]
 * @property {boolean} [warnWhenCannotResolve]
 * @property {(error: Error, input: string) => void} [onParseError] Invoked when parse/simplify throws.
 * @property {(message: string) => void} [onWarn] Invoked when `warnWhenCannotResolve` is set and an expression cannot be reduced to a single value.
 */

/** @typedef {Required<Omit<TransformValueOptions, 'onParseError' | 'onWarn'>> & Pick<TransformValueOptions, 'onParseError' | 'onWarn'>} ResolvedTransformOptions */

/**
 * @typedef {object} PostCssCalcOptions
 * @property {number | false} [precision]
 * @property {boolean} [warnWhenCannotResolve]
 * @property {boolean} [mediaQueries]
 * @property {boolean} [selectors]
 * @property {(error: Error, input: string) => void} [onParseError] Invoked when parse/simplify throws. Replaces the default `result.warn`.
 */

/** @typedef {Required<Omit<PostCssCalcOptions, 'onParseError'>> & Pick<PostCssCalcOptions, 'onParseError'>} ResolvedOptions */

/**
 * Fields threaded unchanged through the token-range walk.
 * `value` is the original full property text, used only for the
 * warnWhenCannotResolve message.
 *
 * @typedef {object} TransformContext
 * @property {ResolvedTransformOptions} options
 * @property {string} value
 * @property {import('@csstools/css-tokenizer').CSSToken[]} tokens
 * @property {Replacement[]} replacements
 */

/**
 * @typedef {object} Replacement
 * @property {number} start
 * @property {number} end
 * @property {import('./lib/node.js').Node} node
 * @property {string} calcName
 * @property {string} matchedName
 */

/**
 * Walk one component-value level. Unsupported functions and simple blocks are
 * traversed, while a supported function is treated as one opaque calculation
 * even when parsing it fails. A missing closer consumes through EOF, matching
 * CSS component-value parsing's error recovery.
 *
 * @param {number} start
 * @param {import('@csstools/css-tokenizer').TokenType | undefined} expectedClose
 * @param {TransformContext} ctx
 * @param {boolean} transform
 * @return {number} Index of the matching closer, or the EOF token.
 */
function walkTokens(start, expectedClose, ctx, transform) {
  for (let i = start; i < ctx.tokens.length; i++) {
    const token = ctx.tokens[i];
    if (token[0] === CssType.EOF || token[0] === expectedClose) {
      return i;
    }

    const blockClose = BLOCK_CLOSE.get(token[0]);
    if (blockClose) {
      i = walkTokens(i + 1, blockClose, ctx, transform);
      continue;
    }

    if (token[0] !== CssType.Function) {
      continue;
    }

    const name = token[4].value;
    const isCalc = MATCH_CALC.test(name);
    const isMath = !isCalc && isSupportedMathFunction(name);
    if (!transform || (!isCalc && !isMath)) {
      i = walkTokens(i + 1, CssType.CloseParen, ctx, transform);
      continue;
    }

    // Locate the complete outer function without transforming its children.
    const close = walkTokens(i + 1, CssType.CloseParen, ctx, false);
    const closed = ctx.tokens[close][0] === CssType.CloseParen;
    const end = closed ? ctx.tokens[close][3] + 1 : ctx.value.length;
    const sliceStart = isCalc ? i + 1 : i;
    const sliceEnd = closed ? close + (isCalc ? 0 : 1) : close;
    const inputStart = isCalc ? token[3] + 1 : token[2];
    const inputEnd = closed && isCalc ? ctx.tokens[close][2] : end;
    const contents = ctx.value.slice(inputStart, inputEnd);
    try {
      const node = simplify(
        parse(tokenizeTokens(ctx.tokens.slice(sliceStart, sliceEnd), end))
      );
      ctx.replacements.push({
        start: token[2],
        end,
        node,
        calcName: isCalc ? name : 'calc',
        matchedName: name,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Error');
      ctx.options.onParseError?.(err, contents);
    }
    i = close;
  }

  return ctx.tokens.length - 1;
}

/**
 * @param {string} value
 * @param {TransformValueOptions} [opts]
 * @return {string}
 */
function transformValue(value, opts) {
  /** @type {ResolvedTransformOptions} */
  const options = {
    precision: 5,
    warnWhenCannotResolve: false,
    ...opts,
  };

  const tokens = cssTokenize({ css: value });
  /** @type {Replacement[]} */
  const replacements = [];
  const ctx = { options, value, tokens, replacements };
  walkTokens(0, undefined, ctx, true);

  /** @type {(Replacement & {text: string})[]} */
  const serialized = replacements.map((replacement) => {
    const text = serialize(replacement.node, {
      precision: options.precision,
      calcName: replacement.calcName,
    });
    if (
      options.warnWhenCannotResolve &&
      text.startsWith(`${replacement.matchedName}(`)
    ) {
      options.onWarn?.('Could not reduce expression: ' + value);
    }
    return { ...replacement, text };
  });

  let output = value;
  for (let i = serialized.length - 1; i >= 0; i--) {
    const replacement = serialized[i];
    output =
      output.slice(0, replacement.start) +
      replacement.text +
      output.slice(replacement.end);
  }
  return output;
}

/**
 * Runs `transformValue` over one text property of a decl/atrule/rule node
 * and updates it in place.
 * `setProp` closes over the property name and the concrete node type at
 * each call site, since `Declaration`/`AtRule`/`Rule` don't share a typed
 * "text property" name to index generically.
 *
 * @param {import('postcss').ChildNode} node
 * @param {string} current
 * @param {(target: import('postcss').ChildNode, value: string) => void} setProp
 * @param {ResolvedOptions} options
 * @param {import('postcss').Result} result
 * @return {void}
 */
function applyTransform(node, current, setProp, options, result) {
  setProp(
    node,
    transformValue(current, {
      precision: options.precision,
      warnWhenCannotResolve: options.warnWhenCannotResolve,
      onParseError:
        options.onParseError ??
        ((error) => {
          result.warn(error.message, { node });
        }),
      onWarn: (message) => {
        result.warn(message, { plugin: 'postcss-calc', node });
      },
    })
  );
}

/**
 * @param {PostCssCalcOptions} [opts]
 * @return {import('postcss').Plugin}
 */
function pluginCreator(opts) {
  /** @type {ResolvedOptions} */
  const options = {
    precision: 5,
    warnWhenCannotResolve: false,
    mediaQueries: false,
    selectors: false,
    ...opts,
  };

  return {
    postcssPlugin: 'postcss-calc',
    /**
     * @param {import('postcss').Root} css
     * @param {import('postcss').Helpers} helpers
     */
    OnceExit(css, { result }) {
      css.walk((node) => {
        if (node.type === 'decl') {
          applyTransform(
            node,
            node.value,
            (n, v) => {
              /** @type {import('postcss').Declaration} */ (n).value = v;
            },
            options,
            result
          );
        }
        if (node.type === 'atrule' && options.mediaQueries) {
          applyTransform(
            node,
            node.params,
            (n, v) => {
              /** @type {import('postcss').AtRule} */ (n).params = v;
            },
            options,
            result
          );
        }
        if (node.type === 'rule' && options.selectors) {
          // Reduces `:nth-child(calc(...))` via the function walk. calc() in a
          // quoted attribute value is a literal match, so it's left untouched.
          applyTransform(
            node,
            node.selector,
            (n, v) => {
              /** @type {import('postcss').Rule} */ (n).selector = v;
            },
            options,
            result
          );
        }
      });
    },
  };
}

/** @type {true} */
pluginCreator.postcss = true;

export default /** @type import('postcss').PluginCreator<PostCssCalcOptions>*/ (
  pluginCreator
);
export { transformValue as reduceCalc, pluginCreator as 'module.exports' };
