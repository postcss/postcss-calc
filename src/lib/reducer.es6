import assign from 'object-assign';
import convert from './convert';

function reduce(node, precision) {
  if (node.type === "MathExpression")
    return reduceMathExpression(node, precision);

  return node;
}

function isEqual(left, right) {
  return left.type === right.type && left.value === right.value;
}

function convertMathExpression(node, precision) {
  let nodes = convert(node.left, node.right);
  let left = reduce(nodes.left, precision);
  let right = reduce(nodes.right, precision);

  if (left.type === "MathExpression" && right.type === "MathExpression") {

    if (((left.operator === '/' && right.operator === '*') ||
      (left.operator === '-' && right.operator === '+')) ||
      ((left.operator === '*' && right.operator === '/') ||
      (left.operator === '+' && right.operator === '-'))) {

      if (isEqual(left.right, right.right))
        nodes = convert(left.left, right.left);

      else if (isEqual(left.right, right.left))
        nodes = convert(left.left, right.right);

      left = reduce(nodes.left, precision);
      right = reduce(nodes.right, precision);

    }
  }

  node.left = left;
  node.right = right;
  return node;
}

function reduceAddSubExpression(node, precision) {
  let op = node.operator;
  let left = node.left;
  let right = node.right;

  // something + 0 => something
  // something - 0 => something
  if (right.value === 0)
    return left;

  // 0 + something => something
  if (left.value === 0 && op === "+")
    return right;

  // value + value
  // value - value
  if (left.type === right.type && left.type !== 'MathExpression') {
    node = assign({ }, left);
    if (op === "+")
      node.value = left.value + right.value;
    else
      node.value = left.value - right.value;
  }

  // value + (expr)
  if (left.type !== 'MathExpression' && right.type === 'MathExpression') {
    // value + (value + something) => (value + value) + something
    // value + (value - something) => (value + value) - something
    // value - (value + something) => (value - value) + something
    // value - (value - something) => (value - value) - something
    if (left.type === right.left.type) {
      node = assign({ }, node);
      node.left = reduce({
        type: 'MathExpression',
        operator: op,
        left: left,
        right: right.left
      }, precision);
      node.right = right.right;
      return reduce(node, precision);
    }
    // value + (something + value) => (value + value) + something
    // value + (something - value) => (value - value) + something
    // value - (something + value) => (value + value) - something
    // value - (something - value) => (value - value) - something
    else if (left.type === right.right.type) {
      node = assign({ }, node);
      node.left = reduce({
        type: 'MathExpression',
        operator: right.operator,
        left: left,
        right: right.right
      }, precision);
      node.right = right.left;
      return reduce(node, precision);
    }
  }

  // (expr) + value
  if (left.type === 'MathExpression' && right.type !== 'MathExpression') {
    // (value + something) + value => (value + value) + something
    // (value - something) + value => (value + value) - something
    // (value + something) - value => (value - value) + something
    // (value - something) - value => (value - value) - something
    if (right.type === left.left.type) {
      node = assign({ }, left);
      node.left = reduce({
        type: 'MathExpression',
        operator: op,
        left: left.left,
        right: right
      }, precision);
      return reduce(node, precision);
    }
    // (something + value) + value => something + (value + value)
    // (something - value) + value => something - (value + value)
    // (something + value) - value => something + (value - value)
    // (something - value) - value => something - (value - value)
    else if (right.type === left.right.type) {
      node = assign({ }, left);
      node.right = reduce({
        type: 'MathExpression',
        operator: op,
        left: left.right,
        right: right
      }, precision);
      return reduce(node, precision);
    }
  }
  return node;
}

function reduceDivisionExpression(node) {
  if (node.right.type !== 'Value')
    return node;

  if (node.right.value === 0)
    return node; // throw error?

  // (expr) / value
  if (node.left.type === 'MathExpression') {
    if (
      node.left.left.type !== 'MathExpression' &&
      node.left.right.type !== 'MathExpression'
    ) {
      node.left.left.value /= node.right.value;
      node.left.right.value /= node.right.value;
      return node.left;
    }
    return node;
  }

  // value / value
  node.left.value /= node.right.value;
  return node.left;
}

function reduceMultiplicationExpression(node) {
  // (expr) * value
  if (node.left.type === 'MathExpression' && node.right.type === 'Value') {
    if (
      node.left.left.type !== 'MathExpression' &&
      node.left.right.type !== 'MathExpression'
    ) {
      node.left.left.value *= node.right.value;
      node.left.right.value *= node.right.value;
      return node.left;
    }
  }
  // something * value
  else if (node.left.type !== 'MathExpression' &&node.right.type === 'Value') {
    node.left.value *= node.right.value;
    return node.left;
  }
  // value * (expr)
  else if (node.left.type === 'Value' && node.right.type === 'MathExpression') {
    if (
      node.right.left.type !== 'MathExpression' &&
      node.right.right.type !== 'MathExpression'
    ) {
      node.right.left.value *= node.left.value;
      node.right.right.value *= node.left.value;
      return node.right;
    }
  }
  // value * something
  else if (node.left.type === 'Value' && node.right.type !== 'MathExpression') {
    node.right.value *= node.left.value;
    return node.right;
  }
  return node;
}

function reduceMathExpression(node, precision) {
  node = convertMathExpression(node, precision);

  switch (node.operator) {
    case "+":
    case "-":
      return reduceAddSubExpression(node, precision);
    case "/":
      return reduceDivisionExpression(node);
    case "*":
      return reduceMultiplicationExpression(node);
  }
  return node;
}

export default reduce;
