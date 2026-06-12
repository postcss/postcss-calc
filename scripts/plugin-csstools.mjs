// Drop-in alternative that delegates to @csstools/css-calc, used for
// head-to-head comparison against the legacy regression suite.
import { calc as csstoolsCalc } from '@csstools/css-calc';
const pluginCreator = (opts = {}) => {
  return {
    postcssPlugin: 'postcss-calc',
    OnceExit(css) {
      css.walk((node) => {
        if (node.type === 'decl') {
          const reduced = csstoolsCalc(node.value);
          if (typeof reduced === 'string' && reduced !== node.value) {
            node.value = reduced;
          }
        }
        if (node.type === 'atrule' && opts.mediaQueries) {
          const reduced = csstoolsCalc(node.params);
          if (typeof reduced === 'string' && reduced !== node.params) {
            node.params = reduced;
          }
        }
        if (node.type === 'rule' && opts.selectors) {
          const reduced = csstoolsCalc(node.selector);
          if (typeof reduced === 'string' && reduced !== node.selector) {
            node.selector = reduced;
          }
        }
      });
    },
  };
};
pluginCreator.postcss = true;
export default pluginCreator;
