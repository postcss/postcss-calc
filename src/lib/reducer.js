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
  const {left, right, operator: op} = node;

  // something + 0 => something
  // something - 0 => something
  if (right.value === 0) {
    return left;
  }

  // 0 + something => something
  if (left.value === 0 && op === "+") {
    return right;
  }

  // 0 - something => -something
  if (left.value === 0 && op === "-") {
    return flipValue(right);
  }

  // value + value
  // value - value
  if (left.type === right.type && isValueType(left.type)) {
    node = Object.assign({ }, left);
    if (op === "+") {
      node.value = left.value + right.value;
    } else {
      node.value = left.value - right.value;
    }
  }

    // value <op> (expr)
  if (
    isValueType(left.type) &&
    (right.operator === '+' || right.operator === '-') &&
    right.type === 'MathExpression'
  ) {
    // value + (value + something) => (value + value) + something
    // value + (value - something) => (value + value) - something
    // value - (value + something) => (value - value) - something
    // value - (value - something) => (value - value) + something
    if (left.type === right.left.type) {
      node = Object.assign({ }, node);
      node.left = reduce({
        type: 'MathExpression',
        operator: op,
        left: left,
        right: right.left
      }, precision);
      node.right = right.right;
      node.operator = op === '-' ? flip(right.operator) : right.operator;
      return reduce(node, precision);
    }
    // value + (something + value) => (value + value) + something
    // value + (something - value) => (value - value) + something
    // value - (something + value) => (value - value) - something
    // value - (something - value) => (value + value) - something
    else if (left.type === right.right.type) {
      node = Object.assign({ }, node);
      node.left = reduce({
        type: 'MathExpression',
        operator: op === '-' ? flip(right.operator) : right.operator,
        left: left,
        right: right.right
      }, precision);
      node.right = right.left;
      return reduce(node, precision);
    }
  }

  // (expr) <op> value
  if (
    left.type === 'MathExpression' &&
    (left.operator === '+' || left.operator === '-') &&
    isValueType(right.type)
  ) {
    // (value + something) + value => (value + value) + something
    // (value - something) + value => (value + value) - something
    // (value + something) - value => (value - value) + something
    // (value - something) - value => (value - value) - something
    if (right.type === left.left.type) {
      node = Object.assign({ }, left);
      node.left = reduce({
        type: 'MathExpression',
        operator: op,
        left: left.left,
        right: right
      }, precision);
      return reduce(node, precision);
    }
    // (something + value) + value => something + (value + value)
    // (something - value1) + value2 => something - (value2 - value1)
    // (something + value) - value => something + (value - value)
    // (something - value) - value => something - (value + value)
    else if (right.type === left.right.type) {
      node = Object.assign({ }, left);
      if (left.operator === '-') {
        node.right = reduce({
          type: 'MathExpression',
          operator: op === '-' ? '+' : '-',
          left: right,
          right: left.right
        }, precision);
        node.operator = op === '-' ? '-' : '+';
      }
      else {
        node.right = reduce({
          type: 'MathExpression',
          operator: op,
          left: left.right,
          right: right
        }, precision);
      }
      if (node.right.value < 0) {
        node.right.value *= -1;
        node.operator = node.operator === '-' ? '+' : '-';
      }
      return reduce(node, precision);
    }
  }

  if (
    right.type === 'MathExpression' &&
    op === '-' && ["+", "-"].includes(right.operator)
  ) {
    node.right.operator = flip(node.right.operator);
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
  else if (isValueType(node.left.type) && node.right.type === 'Number') {
    node.left.value *= node.right.value;
    return node.left;
  }
  // number * (expr)
  else if (node.left.type === 'Number' && node.right.type === 'MathExpression') {
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
  else if (node.left.type === 'Number' && isValueType(node.right.type)) {
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
    let nodes = covertNodesUnits(node.left, node.right, precision);
    let left = reduce(nodes.left, precision);
    let right = reduce(nodes.right, precision);

    if (left.type === "MathExpression" && right.type === "MathExpression") {
      if (((left.operator === '/' && right.operator === '*') ||
        (left.operator === '-' && right.operator === '+')) ||
        ((left.operator === '*' && right.operator === '/') ||
          (left.operator === '+' && right.operator === '-'))) {

        if (isEqual(left.right, right.right)) {
          nodes = covertNodesUnits(left.left, right.left, precision);
        } else if (isEqual(left.right, right.left)) {
          nodes = covertNodesUnits(left.left, right.right, precision);
        }

        left = reduce(nodes.left, precision);
        right = reduce(nodes.right, precision);

      }
    }

    node.left = left;
    node.right = right;

    switch (node.operator) {
      case "+":
      case "-":
        return reduceAddSubExpression(node, precision);
      case "/":
        return reduceDivisionExpression(node, precision);
      case "*":
        return reduceMultiplicationExpression(node);
    }

    return node;
  }

  return node;
}

export default reduce;
