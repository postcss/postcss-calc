import {plugin} from 'postcss';
import assign from 'object-assign';
import transform from './lib/transform';

export default plugin('postcss-calc', (opts) => {
  let options = assign({
    precision: 5,
    preserve: false,
    warnWhenCannotResolve: false,
    mediaQueries: false,
    selectors: false
  }, opts);

  return (css, result) => {
    css.walk(node => {
      if (node.type === 'decl') transform(node, "value", options, result);
      if (node.type === 'atrule' && options.mediaQueries) transform(node, "params", options, result);
      if (node.type === 'rule' && options.selectors) transform(node, "selector", options, result);
    });
  };
});
