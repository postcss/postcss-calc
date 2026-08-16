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
 * @typedef {object} PluginOptions
 * @property {number | false} [precision]
 * @property {boolean} [preserve]
 * @property {boolean} [warnWhenCannotResolve]
 * @property {boolean} [mediaQueries]
 * @property {boolean} [selectors]
 * @property {(error: Error, input: string) => void} [onParseError] Invoked when parse/simplify throws. Replaces the default `result.warn`.
 */

/** @typedef {Required<Omit<PluginOptions, 'onParseError'>> & Pick<PluginOptions, 'onParseError'>} ResolvedOptions */

/**
 * Walks a list of component values in place, replacing matched calc()/math
 * function nodes with their simplified form. Unlike the library's generic
 * `walk` helper, this recurses manually so a matched node's own (stale,
 * pre-simplification) children are never independently re-visited.
 *
 * @param {import('@csstools/css-parser-algorithms').ComponentValue[]} list
 * @param {ResolvedOptions} options
 * @param {import('postcss').Result} result
 * @param {import('postcss').ChildNode} item
 * @param {string} value
 * @return {void}
 */
function transformList(list, options, result, item, value) {
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (!isFunctionNode(node)) {
      if (isSimpleBlockNode(node)) {
        transformList(node.value, options, result, item, value);
      }
      continue;
    }

    const name = node.getName();
    const isCalc = MATCH_CALC.test(name);
    const isMath = !isCalc && isSupportedMathFunction(name);
    if (!isCalc && !isMath) {
      transformList(node.value, options, result, item, value);
      continue;
    }

    // calc(): feed the body. Bare math: feed the whole call.
    const inner = node.value.map((child) => child.toString()).join('');
    const contents = isCalc ? inner : `${name}(${inner})`;
    try {
      const simplified = simplify(parse(tokenize(contents)));
      const str = serialize(simplified, {
        precision: options.precision,
        calcName: isCalc ? name : 'calc', // preserve vendor prefix on calc()
      });

      if (options.warnWhenCannotResolve && str.startsWith(`${name}(`)) {
        result.warn('Could not reduce expression: ' + value, {
          plugin: 'postcss-calc',
          node: item,
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
      if (options.onParseError) {
        options.onParseError(err, contents);
      } else {
        result.warn(err.message, { node: item });
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

  transformList(componentValues, options, result, item, value);

  return componentValues.map((node) => node.toString()).join('');
}

/**
 * @param {PluginOptions} [opts]
 * @return {import('postcss').Plugin}
 */
function pluginCreator(opts) {
  /** @type {ResolvedOptions} */
  const options = {
    precision: 5,
    preserve: false,
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
          const next = transformValue(node.value, options, result, node);
          if (options.preserve && node.value !== next && node.parent) {
            const clone = node.clone();
            clone.value = next;
            node.parent.insertBefore(node, clone);
          } else {
            node.value = next;
          }
        }
        if (node.type === 'atrule' && options.mediaQueries) {
          const next = transformValue(node.params, options, result, node);
          if (options.preserve && node.params !== next && node.parent) {
            const clone = node.clone();
            clone.params = next;
            node.parent.insertBefore(node, clone);
          } else {
            node.params = next;
          }
        }
        if (node.type === 'rule' && options.selectors) {
          // Reduces `:nth-child(calc(...))` via the function walk. calc() in a
          // quoted attribute value is a literal match, so it's left untouched.
          const next = transformValue(node.selector, options, result, node);
          if (options.preserve && node.selector !== next && node.parent) {
            const clone = node.clone();
            clone.selector = next;
            node.parent.insertBefore(node, clone);
          } else {
            node.selector = next;
          }
        }
      });
    },
  };
}

pluginCreator.postcss = true;

export default /** @type import('postcss').PluginCreator<PluginOptions>*/ (
  pluginCreator
);
export { pluginCreator as 'module.exports' };
