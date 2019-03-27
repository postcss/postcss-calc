import convert from './convert';

function reduce(node, options) {
  if (node.type === "MathExpression")
    return reduceMathExpression(node, options);

  return node;
}

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
    case 'Value':
      return true;
  }
  return false;
}

function convertMathExpression(node, options) {
  let nodes = convert(node.left, node.right, options);
  let left = reduce(nodes.left, options);
  let right = reduce(nodes.right, options);

  if (left.type === "MathExpression" && right.type === "MathExpression") {

    if (((left.operator === '/' && right.operator === '*') ||
      (left.operator === '-' && right.operator === '+')) ||
      ((left.operator === '*' && right.operator === '/') ||
      (left.operator === '+' && right.operator === '-'))) {

      if (isEqual(left.right, right.right))
        nodes = convert(left.left, right.left, options);

      else if (isEqual(left.right, right.left))
        nodes = convert(left.left, right.right, options);

      left = reduce(nodes.left, options);
      right = reduce(nodes.right, options);

    }
  }

  node.left = left;
  node.right = right;
  return node;
}

function flip(operator) {
  return operator === '+' ? '-' : '+';
}

function flipValue(node) {
  if (isValueType(node.type))
    node.value = -node.value;
  else if (node.type === 'MathExpression') {
    node.left = flipValue(node.left);
    node.right = flipValue(node.right);
  }
  return node;
}

function reduceAddSubExpression(node, options) {
  const {left, right, operator: op} = node;

  if (left.type === 'Function' || right.type === 'Function')
    return node;

  // something + 0 => something
  // something - 0 => something
  if (right.value === 0)
    return left;

  // 0 + something => something
  if (left.value === 0 && op === "+")
    return right;

  // 0 - something => -something
  if (left.value === 0 && op === "-")
    return flipValue(right);

  // value + value
  // value - value
  if (left.type === right.type && isValueType(left.type)) {
    node = Object.assign({ }, left);
    if (op === "+")
      node.value = left.value + right.value;
    else
      node.value = left.value - right.value;
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
      }, options);
      node.right = right.right;
            node.operator = op === '-' ? flip(right.operator) : right.operator;
      return reduce(node, options);
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
      }, options);
      node.right = right.left;
      return reduce(node, options);
        }
        // value - (something + something) => value - something - something
        else if (op === '-' && right.operator === '+') {
            node = Object.assign({ }, node);
            node.right.operator = '-';
      return reduce(node, options);
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
      }, options);
      return reduce(node, options);
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
          operator: flip(op),
                    left: left.right,
                    right: right
                }, options);
                if (node.right.value && node.right.value < 0) {
                    node.right.value = Math.abs(node.right.value);
                    node.operator = '+';
                } else {
                    node.operator = left.operator;
                }
      }
      else {
        node.right = reduce({
          type: 'MathExpression',
          operator: op,
          left: left.right,
          right: right
        }, options);
      }
      if (node.right.value < 0) {
        node.right.value *= -1;
        node.operator = node.operator === '-' ? '+' : '-';
      }
      return reduce(node, options);
    }
    }

    if (
        left.type === 'MathExpression' && right.type === 'MathExpression' &&
        op === '-' && right.operator === '-'
    ) {
        node.right.operator = flip(node.right.operator);
    }
  return node;
}

function reduceDivisionExpression(node) {
  if (!isValueType(node.right.type))
    return node;

  if (node.right.type !== 'Value')
    throw new Error(`Cannot divide by "${node.right.unit}", number expected`);

  if (node.right.value === 0)
    throw new Error('Cannot divide by zero');

  // something / value
  if (isValueType(node.left.type)) {
    node.left.value /= node.right.value;
    return node.left;
  }
  return node;
}

function reduceMultiplicationExpression(node) {
  // (expr) * value
  if (node.left.type === 'MathExpression' && node.right.type === 'Value') {
    if (
      isValueType(node.left.left.type) &&
      isValueType(node.left.right.type)
    ) {
      node.left.left.value *= node.right.value;
      node.left.right.value *= node.right.value;
      return node.left;
    }
  }
  // something * value
  else if (isValueType(node.left.type) && node.right.type === 'Value') {
    node.left.value *= node.right.value;
    return node.left;
  }
  // value * (expr)
  else if (node.left.type === 'Value' && node.right.type === 'MathExpression') {
    if (
      isValueType(node.right.left.type) &&
      isValueType(node.right.right.type)
    ) {
      node.right.left.value *= node.left.value;
      node.right.right.value *= node.left.value;
      return node.right;
    }
  }
  // value * something
  else if (node.left.type === 'Value' && isValueType(node.right.type)) {
    node.right.value *= node.left.value;
    return node.right;
  }
  return node;
}

function reduceMathExpression(node, options) {
  node = convertMathExpression(node, options);

  switch (node.operator) {
    case "+":
    case "-":
      return reduceAddSubExpression(node, options);
    case "/":
      return reduceDivisionExpression(node, options);
    case "*":
      return reduceMultiplicationExpression(node);
  }
  return node;
}

export default reduce;
