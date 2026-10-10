// Spec: https://www.w3.org/TR/css-values-4/#serialize-a-calculation-tree
// Canonical AST expression emission: node dispatch, sums, products, function
// calls, and math results. These emitters recurse into each other, so they
// share one module; precision and precedence rules live in sibling modules.

import { num } from '../node.js';
import { serializeComponents } from '../opaque.js';
import {
  degenerateKeyword,
  emitBareSignedZero,
  emitRoundedScalar,
  emitScalar,
  emitSignedZero,
  isDegenerate,
  isScalar,
  isSignedZero,
  round,
  roundedScalarValue,
} from './precision.js';
import {
  needsParentheses,
  PRODUCT_PRECEDENCE,
  SUM_PRECEDENCE,
  UNARY_PRECEDENCE,
} from './precedence.js';

/**
 * @typedef {import('../node.js').Node} Node
 * @typedef {import('../node.js').Sum} Sum
 * @typedef {import('../node.js').SumTerm} SumTerm
 * @typedef {import('../node.js').ProductFactor} ProductFactor
 * @typedef {import('./precision.js').SerializeSession} SerializeSession
 */

/**
 * @param {Node} node
 * @param {SerializeSession} session
 * @param {number} [parentPrecedence]
 * @param {boolean} [groupedRequired]
 * @return {void}
 */
function emitNode(
  node,
  session,
  parentPrecedence = 0,
  groupedRequired = false
) {
  const parenthesized = needsParentheses(
    node,
    parentPrecedence,
    groupedRequired
  );
  if (parenthesized) session.buffer.push('(');
  emitNodeBody(node, session);
  if (parenthesized) session.buffer.push(')');
}

/**
 * @param {Node} node
 * @param {SerializeSession} session
 * @return {void}
 */
function emitNodeBody(node, session) {
  const buffer = session.buffer;
  switch (node.type) {
    case 'Num':
    case 'Dim':
      emitScalar(node, session);
      return;
    case 'Ident':
      buffer.push(node.rawName ?? node.name);
      return;
    case 'Call':
      emitCall(node, session);
      return;
    case 'OpaqueCall':
      emitOpaqueCall(node, session);
      return;
    case 'Sum':
      emitSum(node, session);
      return;
    case 'Product':
      emitProductFactors(node.factors, session);
      return;
  }
}

/**
 * @param {import('../node.js').Num | import('../node.js').Dim} termNode
 * @param {1 | -1} sign
 * @param {boolean} leading
 * @param {SerializeSession} session
 * @return {void}
 */
function emitScalarSumTerm(termNode, sign, leading, session) {
  const buffer = session.buffer;
  const effectiveVal = sign * termNode.value;
  if (Object.is(effectiveVal, -0)) {
    // `x - 0` reparses as x + -(0), so subtraction round-trips negative zero.
    // A leading term starts a <calc-product>, so `-1 * 0` needs no calc().
    if (leading) {
      emitBareSignedZero(buffer, termNode);
    } else {
      buffer.push(' - ');
      emitRoundedScalar(termNode, buffer, 0);
    }
    return;
  }
  if (isDegenerate(effectiveVal)) {
    if (!leading) buffer.push(sign === 1 ? ' + ' : ' - ');
    else if (sign === -1) buffer.push('-');
    emitScalar(termNode, session);
    return;
  }
  const rounded = round(effectiveVal, session.precision);
  if (rounded < 0) {
    buffer.push(leading ? '-' : ' - ');
    emitRoundedScalar(termNode, buffer, -rounded);
  } else {
    if (!leading) buffer.push(' + ');
    emitRoundedScalar(termNode, buffer, rounded);
  }
}

/**
 * @param {SumTerm} term
 * @param {boolean} leading
 * @param {SerializeSession} session
 * @return {void}
 */
function emitSumTerm(term, leading, session) {
  const termNode = term.node;
  if (isScalar(termNode)) {
    emitScalarSumTerm(termNode, term.sign, leading, session);
  } else if (leading && term.sign === -1) {
    emitLeadingNeg(termNode, session);
  } else {
    if (!leading) session.buffer.push(term.sign === 1 ? ' + ' : ' - ');
    emitNode(termNode, session, SUM_PRECEDENCE, true);
  }
}

/** @param {SumTerm} term @return {boolean} */
function isNegativeZeroTerm(term) {
  return isScalar(term.node) && Object.is(term.sign * term.node.value, -0);
}

/**
 * @param {Sum} sum
 * @param {SerializeSession} session
 * @return {void}
 */
function emitSum(sum, session) {
  const terms = sum.terms;
  // x + -0 is exactly x for every x, so leading negative zeros can move
  // behind the first other term and use the shorter subtraction form. When
  // every term is negative zero, keep the order so reducing again is stable.
  let lead = 0;
  while (lead < terms.length && isNegativeZeroTerm(terms[lead])) lead++;
  if (lead === terms.length) lead = 0;
  emitSumTerm(terms[lead], true, session);
  for (let i = 0; i < terms.length; i++) {
    if (i !== lead) emitSumTerm(terms[i], false, session);
  }
}

/**
 * @param {Node} node
 * @param {SerializeSession} session
 * @return {void}
 */
function emitLeadingNeg(node, session) {
  if (node.type === 'Product' && !node.grouped) {
    if (
      node.factors.length > 0 &&
      node.factors[0].exponent === 1 &&
      node.factors[0].node.type === 'Num'
    ) {
      const head = node.factors[0].node;
      emitProductFactors(node.factors, session, 1, -head.value, head);
      return;
    }
    emitProductFactors(node.factors, session, 0, -1, num(-1));
    return;
  }
  session.buffer.push('-1 * ');
  emitNode(node, session, UNARY_PRECEDENCE, false);
}

/**
 * @param {ProductFactor[]} factors
 * @param {SerializeSession} session
 * @param {number} [start]
 * @param {number} [coefficientValue]
 * @param {import('../node.js').Num} [coefficientNode]
 * @return {void}
 */
function emitProductFactors(
  factors,
  session,
  start = 0,
  coefficientValue,
  coefficientNode
) {
  const buffer = session.buffer;
  // Only the product's first multiplied scalar may print negative zero as a
  // bare `-1 * 0`: reparsing folds the `-1` back into that same coefficient.
  // After any operator, the `-1` would bind to the preceding operand instead.
  let leading = true;
  if (coefficientValue !== undefined && coefficientValue !== 1) {
    const coefficient = /** @type {import('../node.js').Num} */ (
      coefficientNode
    );
    emitScalar(coefficient, session, coefficientValue, true);
    leading = false;
  }
  for (let i = start; i < factors.length; i++) {
    const factor = factors[i];
    const factorNode = factor.node;
    const multiplied = factor.exponent === 1;
    if (!leading) buffer.push(multiplied ? ' * ' : ' / ');
    else if (!multiplied) buffer.push('1 / ');
    if (isScalar(factorNode)) {
      emitScalar(factorNode, session, undefined, leading && multiplied);
    } else {
      emitNode(factorNode, session, PRODUCT_PRECEDENCE);
    }
    leading = false;
  }
}

/**
 * @param {import('../node.js').Call} node
 * @param {SerializeSession} session
 * @param {string} [callNameOverride]
 * @return {void}
 */
function emitCall(node, session, callNameOverride) {
  const buffer = session.buffer;
  buffer.push(callNameOverride ?? node.rawName ?? node.name, '(');
  for (let i = 0; i < node.args.length; i++) {
    if (i > 0) buffer.push(', ');
    const arg = node.args[i];
    // Every math-function argument is a <calc-sum>, so it needs no calc()
    if (isSignedZero(arg)) emitBareSignedZero(buffer, arg);
    else emitNode(arg, session);
  }
  buffer.push(')');
}

/**
 * @param {import('../node.js').OpaqueCall} node
 * @param {SerializeSession} session
 * @param {string} [callNameOverride]
 * @return {void}
 */
function emitOpaqueCall(node, session, callNameOverride) {
  const buffer = session.buffer;
  buffer.push(callNameOverride ?? node.rawName ?? node.name, '(');
  serializeComponents(node.components, buffer, (child, childBuffer) => {
    emitNestedMathResult(child, session, childBuffer);
  });
  buffer.push(')');
}

/**
 * @param {Node} node
 * @param {SerializeSession} session
 * @param {string} wrapper
 * @return {void}
 */
function emitMathResult(node, session, wrapper) {
  if (isScalar(node)) {
    const scalarValue = roundedScalarValue(node, session.precision);
    const buffer = session.buffer;
    if (isDegenerate(scalarValue)) {
      buffer.push(wrapper, '(', degenerateKeyword(scalarValue));
      if (node.type === 'Dim') buffer.push(' * 1', node.rawUnit ?? node.unit);
      buffer.push(')');
    } else if (session.scalarPolicy === 'standard') {
      buffer.push(wrapper, '(');
      emitRoundedScalar(node, buffer, scalarValue);
      buffer.push(')');
    } else {
      emitRoundedScalar(node, buffer, scalarValue);
    }
    return;
  }
  if (
    node.type === 'Ident' ||
    node.type === 'Call' ||
    node.type === 'OpaqueCall'
  ) {
    emitNode(node, session);
    return;
  }
  if (node.type === 'Sum' && node.terms.length === 1) {
    session.buffer.push(wrapper, '(');
    emitLeadingNeg(node.terms[0].node, session);
    session.buffer.push(')');
    return;
  }
  session.buffer.push(wrapper, '(');
  emitNode(node, session);
  session.buffer.push(')');
}

/**
 * @param {Node} node
 * @param {SerializeSession} session
 * @param {string[]} [buffer]
 * @return {void}
 */
function emitNestedMathResult(node, session, buffer = session.buffer) {
  if (isSignedZero(node)) {
    emitSignedZero(buffer, node);
    return;
  }
  emitMathResult(node, session, 'calc');
}

export {
  emitNode,
  emitLeadingNeg,
  emitCall,
  emitOpaqueCall,
  emitMathResult,
  emitNestedMathResult,
};
