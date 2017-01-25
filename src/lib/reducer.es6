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
    if (left.value === 0)
      return right;

    if (right.value === 0)
      return left;

    if (left.type === right.type && left.type !== 'MathExpression') {
      node = assign({ }, left);
      if (op === "+")
        node.value = left.value + right.value;
      else
        node.value = left.value - right.value;
    }
  }

  if (left.type === 'MathExpression' || right.type === 'MathExpression')
    return node;

  if (op === '/' && right.type === 'Value' && right.value !== 0) {
    node = assign({ }, left);
    let prec = Math.pow(10, precision);
    node.value = Math.round((left.value / right.value) * prec) / prec;
  }

  if (op === '*') {
    if (right.type === 'Value') {
      node = assign({ }, left);
      node.value *= right.value;
    }
    else if (left.type === 'Value') {
      node = assign({ }, right);
      node.value *= left.value;
    }
  }

  return node;
}

export default reduce;
