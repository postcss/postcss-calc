import transform from './lib/transform';

function pluginCreator(opts) {
  const options = Object.assign({
    precision: 5,
    preserve: false,
    warnWhenCannotResolve: false,
    mediaQueries: false,
    selectors: false
  }, opts);
  return {
    postcssPlugin: 'postcss-calc',
    Declaration(node, {result}) {
      transform(node, "value", options, result);
    },
    AtRule(node, {result}) {
      if (options.mediaQueries) {
        transform(node, "params", options, result);
      }
    },
    Rule(node, {result}) {
      if (options.selectors) {
        transform(node, "selector", options, result);
      }
    }
  }
}

pluginCreator.postcss = true;

export default pluginCreator;
