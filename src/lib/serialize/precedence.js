// Spec: https://www.w3.org/TR/css-values-4/#serialize-a-calculation-tree
// Operator precedence and parenthesization rules for canonical AST emission.

/**
 * @typedef {import('../node.js').Node} Node
 */

// The AST is canonical: sums and products are flat, except grouped nodes that
// keep their parentheses, so these precedence levels cover every binary expression
const SUM_PRECEDENCE = 1;
const PRODUCT_PRECEDENCE = 2;
const ATOMIC_PRECEDENCE = 3;
// Negation (-1 * ...) binds more tightly than a sum but has the same atomic boundary
// for deciding whether the operand needs parentheses.
const UNARY_PRECEDENCE = ATOMIC_PRECEDENCE;

/** @param {Node} node @return {number} */
function precedence(node) {
  if (node.type === 'Sum') return SUM_PRECEDENCE;
  if (node.type === 'Product') return PRODUCT_PRECEDENCE;
  return ATOMIC_PRECEDENCE;
}

/**
 * @param {Node} node
 * @param {number} parentPrecedence
 * @param {boolean} groupedRequired
 * @return {boolean}
 */
function needsParentheses(node, parentPrecedence, groupedRequired) {
  return (
    precedence(node) < parentPrecedence ||
    (node.type === 'Sum' &&
      node.grouped === true &&
      groupedRequired === true) ||
    (node.type === 'Product' && node.grouped === true && parentPrecedence > 0)
  );
}

export {
  SUM_PRECEDENCE,
  PRODUCT_PRECEDENCE,
  ATOMIC_PRECEDENCE,
  UNARY_PRECEDENCE,
  precedence,
  needsParentheses,
};
