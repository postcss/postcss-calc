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
    css.walkDecls(node => transform(node, "value", options, result));
    if (options.mediaQueries)
      css.walkAtRules(node => transform(node, "params", options, result));

    if (options.selectors)
      css.walkRules(node => transform(node, "selector", options, result));
  };
});
