const order = {
  "*": 0,
  "/": 0,
  "+": 1,
  "-": 1,
};

var nonAssociative = {
  '*': false,
  '/': true,
  '+': false,
  '-': true
}

function needsParenthesis(op, childOp){
  let opOrder = order[op];
  let childOpOrder = order[childOp];
  if (opOrder === childOpOrder){
    // Chains of the same operation only need parenthesis if non-associative
    if (op === childOp){
      return nonAssociative[op];
    } else {
      // Same precedence but different operator: always
      return true;
    }
  } else {
    // Follow operator precendence
    return order[op] < order[childOp];
  }
}

function round(value, prec) {
  if (prec !== false) {
    const precision = Math.pow(10, prec);
    return Math.round(value * precision) / precision;
  }
  return value;
}

function stringify(node, prec) {
  switch (node.type) {
    case "MathExpression": {
      const {left, right, operator: op} = node;
      let str = "";

      if (left.type === 'MathExpression' && needsParenthesis(op, left.operator)) {
        str += `(${stringify(left, prec)})`;
      } else {
        str += stringify(left, prec);
      }

      str += order[op] ? ` ${node.operator} ` : node.operator;

      if (right.type === 'MathExpression' && needsParenthesis(op, right.operator)) {
        str += `(${stringify(right, prec)})`;
      } else {
        str += stringify(right, prec);
      }

      return str;
    }
    case 'Number':
      return round(node.value, prec);
    case 'Function':
      return node.value;
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
    item
  ) {
  let str = stringify(node, options.precision);

  const shouldPrintCalc = node.type === "MathExpression" || node.type === "Function";

  if (shouldPrintCalc) {
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
