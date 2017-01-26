const order = {
  "*": 0,
  "/": 0,
  "+": 1,
  "-": 1
};

function round(value, prec) {
  let precision = Math.pow(10, prec);
  return Math.round(value * precision) / precision;
}

function stringify(node, prec) {
  switch (node.type) {
    case "MathExpression":
      let op = node.operator;
      let left = node.left;
      let right = node.right;
      let str = "";

      if (left.type === 'MathExpression' && order[op] < order[left.operator])
        str += "(" + stringify(left, prec) + ")";
      else
        str += stringify(left, prec);

      str += " " + node.operator + " ";

      if (right.type === 'MathExpression' && order[op] < order[right.operator])
        str += "(" + stringify(right, prec) + ")";
      else
        str += stringify(right, prec);

      return str;
    case "Value":
      return round(node.value, prec);
    default:
      return round(node.value, prec) + node.unit;
  }
}

export default function (
    calc,
    node,
    originalValue,
    options,
    result,
    item) {
  let str = stringify(node, options.precision);

  if (node.type === "MathExpression") {
    // if calc expression couldn't be resolved to a single value, re-wrap it as
    // a calc()
    str = calc + "(" + str + ")";

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
