import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser'; 

// eslint-disable-next-line import/no-unresolved
import { parser } from '../parser';

import reducer from './reducer';
import stringifier from './stringifier';

const MATCH_CALC = /((?:-(moz|webkit)-)?calc)/i;

function transformValue(value, options, result, item) {
  return valueParser(value).walk(node => {
    // skip anything which isn't a calc() function
    if (node.type !== 'function' || !MATCH_CALC.test(node.value)) {
      return node;
    }

    // stringify calc expression and produce an AST
    const contents = valueParser.stringify(node.nodes);
    const ast = parser.parse(contents);
    
    // reduce AST to its simplest form, that is, either to a single value
    // or a simplified calc expression
    const reducedAst = reducer(ast, options.precision);

    // stringify AST and write it back
    node.type = 'word';
    node.value = stringifier(
      node.value,
      reducedAst,
      value,
      options,
      result,
      item);

  }, true).toString();
}

function transformSelector(value, options, result, item) {
  return selectorParser(selectors => {
    selectors.walk(node => {
      // attribute value
      // e.g. the "calc(3*3)" part of "div[data-size="calc(3*3)"]"
      if (node.type === 'attribute' && node.value) {
        node.setValue(transformValue(node.value, options, result, item));
      }

      // tag value
      // e.g. the "calc(3*3)" part of "div:nth-child(2n + calc(3*3))"
      if (node.type === 'tag')
        node.value = transformValue(node.value, options, result, item);

      return;
    });
  }).processSync(value);
}

export default (node, property, options, result) => {
  const value = property === "selector"
    ? transformSelector(node[property], options, result, node)
    : transformValue(node[property], options, result, node);

  // if the preserve option is enabled and the value has changed, write the
  // transformed value into a cloned node which is inserted before the current
  // node, preserving the original value. Otherwise, overwrite the original
  // value.
  if (options.preserve && node[property] !== value) {
    const clone = node.clone();
    clone[property] = value;
    node.parent.insertBefore(node, clone);
  }
  else node[property] = value;
};
