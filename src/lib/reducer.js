import convertUnit from "./convertUnit";

function isEqual(left, right) {
  return left.type === right.type && left.value === right.value;
}

function isValueType(type) {
  switch (type) {
    case 'LengthValue':
    case 'AngleValue':
    case 'TimeValue':
    case 'FrequencyValue':
    case 'ResolutionValue':
    case 'EmValue':
    case 'ExValue':
    case 'ChValue':
    case 'RemValue':
    case 'VhValue':
    case 'VwValue':
    case 'VminValue':
    case 'VmaxValue':
    case 'PercentageValue':
    case 'Number':
      return true;
  }
  return false;
}

function flip(operator) {
  return operator === '+' ? '-' : '+';
}

function flipValue(node) {
  if (isValueType(node.type)) {
    node.value = -node.value;
  } else if (node.type === 'MathExpression') {
    node.left = flipValue(node.left);
    node.right = flipValue(node.right);
  }

  return node;
}

function reduceAddSubExpression(node, precision) {
  // something + 0 => something
  // something - 0 => something
  if (isValueType(node.right.type) && node.right.value === 0) {
    return node.left;
  }

  // 0 + something => something
  if (isValueType(node.left.type) && node.left.value === 0 && node.operator === "+") {
    return node.right;
  }

  // 0 - something => -something
  if (
    isValueType(node.left.type) &&
    node.left.value === 0 &&
    node.operator === "-" &&
    node.right.type !== "Function"
  ) {
    return flipValue(node.right);
  }

  // value + value
  // value - value
  if (isValueType(node.left.type) && node.left.type === node.right.type) {
    const operator = node.operator;
    const {left, right} = covertNodesUnits(node.left, node.right, precision);

    if (operator === "+") {
      left.value += right.value;
    } else {
      left.value -= right.value;
    }

    return left;
  }

  // value <op> (expr)
  if (
    node.right.type === 'MathExpression' &&
    (node.right.operator === '+' || node.right.operator === '-')
  ) {
    // something - (something + something) => something - something - something
    // something - (something - something) => something - something + something
    if (
      (node.right.operator === '+' || node.right.operator === '-') &&
      node.operator === '-'
    ) {
      node.right.operator = flip(node.right.operator);
    }

    if (isValueType(node.left.type)) {
      // value + (value + something) => value + something
      // value + (value - something) => value - something
      // value - (value + something) => value - something
      // value - (value - something) => value + something
      if (node.left.type === node.right.left.type) {
        const { left, operator, right } = node;

        node.left = reduce({
          type: 'MathExpression',
          operator: operator,
          left: left,
          right: right.left
        });
        node.operator = right.operator;
        node.right = right.right;

        return reduce(node, precision);
      }

      // something + (something + value) => dimension + something
      // something + (something - value) => dimension + something
      // something - (something + value) => dimension - something
      // something - (something - value) => dimension - something
      if (node.left.type === node.right.right.type) {
        const { left, right } = node;

        node.left = reduce({
          type: 'MathExpression',
          operator: right.operator,
          left: left,
          right: right.right
        });
        node.right = right.left;

        return reduce(node, precision);
      }
    }
  }

  // (expr) <op> value
  if (
    node.left.type === 'MathExpression' &&
    (node.left.operator === '+' || node.left.operator === '-') &&
    isValueType(node.right.type)
  ) {
    // (value + something) + value => value + something
    // (value - something) + value => value - something
    // (value + something) - value => value + something
    // (value - something) - value => value - something
    if (node.right.type === node.left.left.type) {
      const { left, operator, right } = node;

      left.left = reduce({
        type: 'MathExpression',
        operator: operator,
        left: left.left,
        right: right
      }, precision);

      return reduce(left, precision);
    }

    // (something + dimension) + dimension => something + dimension
    // (something - dimension) + dimension => something - dimension
    // (something + dimension) - dimension => something + dimension
    // (something - dimension) - dimension => something - dimension
    if (node.right.type === node.left.right.type) {
      const { left, operator, right } = node;

      if (left.operator === '-') {
        left.operator = operator === '-' ? '-' : '+';
        left.right = reduce({
          type: 'MathExpression',
          operator: operator === '-' ? '+' : '-',
          left: right,
          right: left.right
        }, precision);
      } else {
        left.right = reduce({
          type: 'MathExpression',
          operator: operator,
          left: left.right,
          right: right
        }, precision);
      }

      if (left.right.value < 0) {
        left.right.value *= -1;
        left.operator = left.operator === '-' ? '+' : '-';
      }

      left.parenthesized = node.parenthesized;

      return reduce(left, precision);
    }
  }

  // (expr) + (expr) => number
  // (expr) - (expr) => number
  if (node.right.type === 'MathExpression' && node.left.type === 'MathExpression') {
    if (isEqual(node.left.right, node.right.right)) {
      const newNodes = covertNodesUnits(node.left.left, node.right.left, precision);

      node.left = newNodes.left;
      node.right = newNodes.right;

      return reduce(node);
    }

    if (isEqual(node.left.right, node.right.left)) {
      const newNodes = covertNodesUnits(node.left.left, node.right.right, precision);

      node.left = newNodes.left;
      node.right = newNodes.right;

      return reduce(node);
    }
  }

  return node;
}

function reduceDivisionExpression(node) {
  if (!isValueType(node.right.type)) {
    return node;
  }

  if (node.right.type !== 'Number') {
    throw new Error(`Cannot divide by "${node.right.unit}", number expected`);
  }

  if (node.right.value === 0) {
    throw new Error('Cannot divide by zero');
  }

  // something / value
  if (isValueType(node.left.type)) {
    node.left.value /= node.right.value;

    return node.left;
  }

  return node;
}

function reduceMultiplicationExpression(node) {
  // (expr) * number
  if (node.left.type === 'MathExpression' && node.right.type === 'Number') {
    if (
      isValueType(node.left.left.type) &&
      isValueType(node.left.right.type)
    ) {
      node.left.left.value *= node.right.value;
      node.left.right.value *= node.right.value;

      return node.left;
    }
  }

  // something * number
  if (isValueType(node.left.type) && node.right.type === 'Number') {
    node.left.value *= node.right.value;

    return node.left;
  }

  // number * (expr)
  if (node.left.type === 'Number' && node.right.type === 'MathExpression') {
    if (
      isValueType(node.right.left.type) &&
      isValueType(node.right.right.type)
    ) {
      node.right.left.value *= node.left.value;
      node.right.right.value *= node.left.value;

      return node.right;
    }
  }

  // number * something
  if (node.left.type === 'Number' && isValueType(node.right.type)) {
    node.right.value *= node.left.value;
    return node.right;
  }

  return node;
}

function covertNodesUnits(left, right, precision) {
  switch (left.type) {
    case 'LengthValue':
    case 'AngleValue':
    case 'TimeValue':
    case 'FrequencyValue':
    case 'ResolutionValue':
      if (right.type === left.type && right.unit && left.unit) {
        const converted = convertUnit(right.value, right.unit, left.unit, precision);

        right = {
          type: left.type,
          value: converted,
          unit: left.unit,
        };
      }

      return { left, right };
    default:
      return { left, right };
  }
}

function reduce(node, precision) {
  if (node.type === "MathExpression") {
    node.left = reduce(node.left, precision);
    node.right = reduce(node.right, precision);

    switch (node.operator) {
      case "+":
      case "-":
        return reduceAddSubExpression(node, precision);
      case "/":
        return reduceDivisionExpression(node, precision);
      case "*":
        return reduceMultiplicationExpression(node, precision);
    }

    return node;
  }

  return node;
}

export default reduce;
