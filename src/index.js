// PostCSS adapter over the standalone component-value reducer.
import reduceCalc from './reduce.js';
import { hasPotentialMathFunction } from './lib/functions.js';
/**
 * @typedef {object} PostCssCalcOptions
 * @property {number | false} [precision]
 * @property {boolean} [warnWhenCannotResolve]
 * @property {boolean} [mediaQueries]
 * @property {boolean} [selectors]
 * @property {boolean} [unwrapSingleValue] Serialize fully resolved finite scalar results without calculation syntax. Defaults to `false`.
 * @property {(error: Error, input: string) => void} [onParseError] Invoked when parse/simplify throws. Replaces the default `result.warn`.
 */

/** @typedef {Required<Omit<PostCssCalcOptions, 'onParseError'>> & Pick<PostCssCalcOptions, 'onParseError'>} ResolvedOptions */

/**
 * Runs `reduceCalc` over one text property of a decl/atrule/rule node
 * and updates it in place.
 *
 * @param {import('postcss').Declaration | import('postcss').AtRule | import('postcss').Rule} node
 * @param {'value' | 'params' | 'selector'} prop
 * @param {ResolvedOptions} options
 * @param {import('postcss').Result} result
 * @return {void}
 */
function applyTransform(node, prop, options, result) {
  // `Declaration`/`AtRule`/`Rule` don't share a typed "text property" name.
  const target = /** @type {Record<typeof prop, string>} */ (
    /** @type {unknown} */ (node)
  );
  const current = target[prop];
  if (!hasPotentialMathFunction(current)) {
    return;
  }
  const transformed = reduceCalc(current, {
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
    // Selectors cannot contain calc(), so they always unwrap resolved values.
    unwrapSingleValue: prop === 'selector' || options.unwrapSingleValue,
  });
  if (transformed !== current) {
    target[prop] = transformed;
  }
}

/**
 * @param {PostCssCalcOptions} [opts]
 * @return {import('postcss').Plugin}
 */
function pluginCreator(opts) {
  /** @type {ResolvedOptions} */
  const options = {
    warnWhenCannotResolve: false,
    mediaQueries: false,
    selectors: false,
    unwrapSingleValue: false,
    ...opts,
    // An explicit `precision: undefined` keeps the default.
    precision: opts?.precision ?? 5,
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
          applyTransform(node, 'value', options, result);
        } else if (node.type === 'atrule' && options.mediaQueries) {
          applyTransform(node, 'params', options, result);
        } else if (node.type === 'rule' && options.selectors) {
          // Reduces `:nth-child(calc(...))` via the function walk. calc() in a
          // quoted attribute value is a literal match, so it's left untouched.
          applyTransform(node, 'selector', options, result);
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
