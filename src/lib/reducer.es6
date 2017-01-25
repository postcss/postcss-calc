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

function reduceMathExpression(node, precision) {
  node = convertMathExpression(node, precision);
  let op = node.operator;
  let left = node.left;
  let right = node.right;

  if (op === "+" || op === "-") {
    // something + 0 => value
    // value - 0 => value
    if (right.value === 0)
      return left;

    // 0 + value => value
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
  }

  if (op === '/' && right.type === 'Value' && right.value !== 0) {
    if (left.type === 'MathExpression') {
      if (left.left.type !== 'MathExpression' && left.right.type !== 'MathExpression') {
        left.left.value /= right.value;
        left.right.value /= right.value;
        node = left;
      }
    }
    else {
      node = assign({ }, left);
      node.value /= right.value;
    }
  }

  if (op === '*') {
    if (right.type === 'Value') {
      if (left.type === 'MathExpression') {
        if (left.left.type !== 'MathExpression' && left.right.type !== 'MathExpression') {
          left.left.value *= right.value;
          left.right.value *= right.value;
          node = left;
        }
      }
      else {
        node = assign({ }, left);
        node.value *= right.value;
      }
    }
    else if (left.type === 'Value') {
      if (right.type === 'MathExpression') {
        if (right.left.type !== 'MathExpression' && right.right.type !== 'MathExpression') {
          right.left.value *= left.value;
          right.right.value *= left.value;
          node = right;
        }
      }
      else {
        node = assign({ }, right);
        node.value *= left.value;
      }
    }
  }

  return node;
}

export default reduce;
