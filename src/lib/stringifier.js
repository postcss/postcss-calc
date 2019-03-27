const order = {
  "*": 0,
  "/": 0,
  "+": 1,
  "-": 1,
};

function round(value, options) {
  if (options.precision !== false && options.allowRounding) {
    const precision = Math.pow(10, options.precision);
    return Math.round(value * precision) / precision;
  }
  return value;
}

function stringify(node, options) {
  switch (node.type) {
    case "MathExpression": {
      const {left, right, operator: op} = node;
      let str = "";

      if (left.type === 'MathExpression' && order[op] < order[left.operator])
        str += `(${stringify(left, options)})`;
      else
        str += stringify(left, options);

      str += order[op] ? ` ${node.operator} ` : node.operator;

      if (right.type === 'MathExpression' && order[op] < order[right.operator])
        str += `(${stringify(right, options)})`;
      else
        str += stringify(right, options);

      return str;
    }
    case "Value":
      return round(node.value, options);
    case 'Function':
      return node.value;
    default:
      return round(node.value, options) + node.unit;
  }
}

export default function (
    calc,
    node,
    originalValue,
    options,
    result,
    item
  ) {
  let str = stringify(node, options);

  if (node.type === "MathExpression") {
    // if calc expression couldn't be resolved to a single value, re-wrap it as
    // a calc()
    str = `${calc}(${str})`;

    // if the warnWhenCannotResolve option is on, inform the user that the calc
    // expression could not be resolved to a single value
    if (options.warnWhenCannotResolve) {
      result.warn(
        "Could not reduce expression: " + originalValue,
        { plugin: 'postcss-calc', node: item });
    }
  }
  return str;
}
