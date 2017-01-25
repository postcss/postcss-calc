const order = {
  "*": 0,
  "/": 0,
  "+": 1,
  "-": 1
};

function stringify(node) {
  switch (node.type) {
    case "MathExpression":
      let op = node.operator;
      let left = node.left;
      let right = node.right;
      let str = "";

      if (left.type === 'MathExpression' && order[op] < order[left.operator])
        str += "(" + stringify(left) + ")";
      else
        str += stringify(left);

      str += " " + node.operator + " ";

      if (right.type === 'MathExpression' && order[op] < order[right.operator])
        str += "(" + stringify(right) + ")";
      else
        str += stringify(right);

      return str;
    case "LengthValue":
    case "AngleValue":
    case "TimeValue":
    case "FrequencyValue":
    case "ResolutionValue":
      return node.value + node.unit;
    case "EmValue":
      return node.value + "em";
    case "ExValue":
      return node.value + "ex";
    case "ChValue":
      return node.value + "ch";
    case "RemValue":
      return node.value + "rem";
    case "VhValue":
      return node.value + "vh";
    case "VwValue":
      return node.value + "vw";
    case "VminValue":
      return node.value + "vmin";
    case "VmaxValue":
      return node.value + "vmax";
    case "PercentageValue":
      return node.value + "%";
    case "Value":
      return node.value;
  }
}

export default function (
    calc,
    node,
    originalValue,
    warnWhenCannotResolve,
    result,
    item) {
  let str = stringify(node);

  if (node.type === "MathExpression") {
    // if calc expression couldn't be resolved to a single value, re-wrap it as
    // a calc()
    str = calc + "(" + str + ")";

    // if the warnWhenCannotResolve option is on, inform the user that the calc
    // expression could not be resolved to a single value 
    if (warnWhenCannotResolve) {
      result.warn(
        "Could not reduce expression: " + originalValue,
        { plugin: 'postcss-calc', node: item });
    }
  }
  return str;
}
