// PostCSS adapter. Walks declaration values (and optionally @rule params
// and selectors), feeds calc() bodies through tokenize → parse → simplify
// → serialize, and writes the result back.
import { tokenize as cssTokenize } from '@csstools/css-tokenizer';
import {
  isFunctionNode,
  isSimpleBlockNode,
  parseListOfComponentValues,
} from '@csstools/css-parser-algorithms';
import { tokenize } from './lib/tokenizer.js';
import { parse } from './lib/parser.js';
import { simplify } from './lib/simplify.js';
import { isSupportedMathFunction } from './lib/simplify/call.js';
import { serialize } from './lib/serialize.js';

// The outer walk is deliberately forgiving: it only needs to locate calc()/
// math-function boundaries in otherwise arbitrary (and possibly non-standard)
// CSS values, so parse errors from the outer tokenizer/parser are swallowed.
// Genuine syntax problems inside a matched call are
// caught below via our own tokenize/parse/simplify pipeline.
const NOOP_PARSE_ERROR = { onParseError: () => {} };

const MATCH_CALC = /^(?:-(?:moz|webkit)-)?calc$/i;

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
 * Fields threaded unchanged through the recursive `transformList` walk.
 * `value` is the original full property text, used only for the
 * warnWhenCannotResolve message.
 *
 * @typedef {object} TransformContext
 * @property {ResolvedOptions} options
 * @property {import('postcss').Result} result
 * @property {import('postcss').ChildNode} item
 * @property {string} value
 */

/**
 * Walks a list of component values in place, replacing matched calc()/math
 * function nodes with their simplified form. Unlike the library's generic
 * `walk` helper, this recurses manually so a matched node's own (stale,
 * pre-simplification) children are never independently re-visited.
 *
 * @param {import('@csstools/css-parser-algorithms').ComponentValue[]} list
 * @param {TransformContext} ctx
 * @return {void}
 */
function transformList(list, ctx) {
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (!isFunctionNode(node)) {
      if (isSimpleBlockNode(node)) {
        transformList(node.value, ctx);
      }
      continue;
    }

    const name = node.getName();
    const isCalc = MATCH_CALC.test(name);
    const isMath = !isCalc && isSupportedMathFunction(name);
    if (!isCalc && !isMath) {
      transformList(node.value, ctx);
      continue;
    }

    // calc(): feed the body. Bare math: feed the whole call.
    const inner = node.value.map((child) => child.toString()).join('');
    const contents = isCalc ? inner : `${name}(${inner})`;
    try {
      const simplified = simplify(parse(tokenize(contents)));
      const str = serialize(simplified, {
        precision: ctx.options.precision,
        calcName: isCalc ? name : 'calc', // preserve vendor prefix on calc()
      });

      if (ctx.options.warnWhenCannotResolve && str.startsWith(`${name}(`)) {
        ctx.result.warn('Could not reduce expression: ' + ctx.value, {
          plugin: 'postcss-calc',
          node: ctx.item,
        });
      }

      const replacement = parseListOfComponentValues(
        cssTokenize({ css: str }),
        NOOP_PARSE_ERROR
      );
      list.splice(i, 1, ...replacement);
      i += replacement.length - 1;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Error');
      if (ctx.options.onParseError) {
        ctx.options.onParseError(err, contents);
      } else {
        ctx.result.warn(err.message, { node: ctx.item });
      }
    }
  }
}

/**
 * @param {string} value
 * @param {ResolvedOptions} options
 * @param {import('postcss').Result} result
 * @param {import('postcss').ChildNode} item
 * @return {string}
 */
function transformValue(value, options, result, item) {
  const componentValues = parseListOfComponentValues(
    cssTokenize({ css: value }),
    NOOP_PARSE_ERROR
  );

  transformList(componentValues, { options, result, item, value });

  return componentValues.map((node) => node.toString()).join('');
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
  setProp(node, transformValue(current, options, result, node));
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
export { pluginCreator as 'module.exports' };
