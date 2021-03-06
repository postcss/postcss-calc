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
    OnceExit(css, { result }) {
      css.walk(node => {
        const { type } = node;

        if (type === 'decl') {
          transform(node, "value", options, result);
        }
        
        if (type === 'atrule' && options.mediaQueries) {
          transform(node, "params", options, result);
        }

        if (type === 'rule' && options.selectors) {
          transform(node, "selector", options, result);
        }
      });
    }
  }
}

pluginCreator.postcss = true;

export default pluginCreator;
