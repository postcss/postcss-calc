'use strict';

// PostCSS adapter. Walks declaration values (and optionally @rule params
// and selectors), feeds calc() bodies through tokenize → parse → simplify
// → serialize, and writes the result back.

const valueParser = require('postcss-value-parser');

const { tokenize } = require('./lib/tokenizer.js');
const { parse } = require('./lib/parser.js');
const { simplify } = require('./lib/simplify.js');
const { serialize } = require('./lib/serialize.js');

const MATCH_CALC = /^(?:-(?:moz|webkit)-)?calc$/i;

// Bare math-function calls (no calc() wrapper) — fed to the same pipeline.
// Mirrors the dispatch in lib/simplify/call.js.
const MATH_FUNCTIONS = new Set([
  'min', 'max', 'clamp',
  'abs', 'sign',
  'mod', 'rem', 'round',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'pow', 'sqrt', 'hypot', 'log', 'exp',
]);

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
 * @param {string} value
 * @param {ResolvedOptions} options
 * @param {import('postcss').Result} result
 * @param {import('postcss').ChildNode} item
 * @param {boolean} [descendIntoStrings] Recurse into quoted strings — needed for selectors where calc()
 *   hides inside attribute values like `[data-size="calc(3*3)"]`.
 *   Off by default: a declaration value like `content: "calc(...)"`
 *   is a literal display string, not arithmetic.
 * @return {string}
 */
function transformValue(value, options, result, item, descendIntoStrings = false) {
  return valueParser(value)
    .walk((node) => {
      if (node.type === 'string' && descendIntoStrings) {
        node.value = transformValue(node.value, options, result, item, true);
        return;
      }
      if (node.type !== 'function') {return;}
      const isCalc = MATCH_CALC.test(node.value);
      const isMath = !isCalc && MATH_FUNCTIONS.has(node.value.toLowerCase());
      if (!isCalc && !isMath) {return;}

      // calc(): feed the body. Bare math: feed the whole call.
      const inner = valueParser.stringify(node.nodes);
      const contents = isCalc ? inner : `${node.value}(${inner})`;
      try {
        const simplified = simplify(parse(tokenize(contents)));
        const str = serialize(simplified, {
          precision: options.precision,
          calcName: isCalc ? node.value : 'calc', // preserve vendor prefix on calc()
        });

        if (options.warnWhenCannotResolve && str.startsWith(`${node.value}(`)) {
          result.warn('Could not reduce expression: ' + value, {
            plugin: 'postcss-calc',
            node: item,
          });
        }

        /** @type {{type: string}} */ (node).type = 'word';
        node.value = str;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Error');
        if (options.onParseError) {
          options.onParseError(err, contents);
        } else {
          result.warn(err.message, { node: item });
        }
      }
      return false;
    })
    .toString();
}

/**
 * @type {import('postcss').PluginCreator<PluginOptions>}
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
          // Selectors carry calc() in two places: pseudo-class arguments
          // (`:nth-child(...)` — caught by the function walk) and quoted
          // attribute values (`[data-size="calc(3*3)"]` — needs string
          // recursion).
          const next = transformValue(node.selector, options, result, node, true);
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

module.exports = pluginCreator;
