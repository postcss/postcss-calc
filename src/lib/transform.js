import selectorParser from 'postcss-selector-parser';
import reduceCssCalc from 'reduce-css-calc';

const MATCH_CALC = /((?:\-[a-z]+\-)?calc)/;

function transformValue(value, options, result, item) {
  if (!value) {
    return value;
  }

  const reduced = reduceCssCalc(value, options.precision)
  // if the warnWhenCannotResolve option is on, inform the user that the calc
  // expression could not be resolved to a single value
  if (options.warnWhenCannotResolve && MATCH_CALC.test(reduced)) {
    result.warn(
      "Could not reduce expression: " + value,
      { plugin: 'postcss-calc', node: item });
  }

  return reduced
}

function transformSelector(value, options, result, item) {
  return selectorParser(selectors => {
    selectors.walk(node => {
      // attribute value
      // e.g. the "calc(3*3)" part of "div[data-size="calc(3*3)"]"
      if (node.type === 'attribute') {
        const val = transformValue(node.raws.unquoted, options, result, item);
        node.value = node.quoted ? '"' + val + '"' : val;
      }

      // tag value
      // e.g. the "calc(3*3)" part of "div:nth-child(2n + calc(3*3))"
      if (node.type === 'tag')
        node.value = transformValue(node.value, options, result, item);

      return;
    });
  }).process(value).result.toString();
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
