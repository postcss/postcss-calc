import {plugin} from 'postcss';

import transform from './lib/transform';

export default plugin('postcss-calc', (opts) => {
  const options = Object.assign({
    precision: 5,
    preserve: false,
    warnWhenCannotResolve: false,
    mediaQueries: false,
    selectors: false
  }, opts);

  return (css, result) => {
    css.walk(node => {
      const { type } = node;
      if (type === 'decl') transform(node, "value", options, result);
      if (type === 'atrule' && options.mediaQueries) transform(node, "params", options, result);
      if (type === 'rule' && options.selectors) transform(node, "selector", options, result);
    });
  };
});
