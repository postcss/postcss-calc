// Spec: https://www.w3.org/TR/css-values-4/#serialize-a-calculation-tree
// Canonical AST expression emission: operator precedence, parenthesization,
// sum terms, product factors, and function calls.

import { serializeComponents } from '../opaque.js';
import { num } from '../node.js';
import {
  round,
  isDegenerate,
  degenerateKeyword,
  roundedScalarValue,
  emitRoundedScalar,
  emitScalar,
  emitSignedZero,
  isScalar,
  isSignedZero,
  isEffectivelyNegative,
} from './precision.js';

/**
 * @typedef {import('../node.js').Node} Node
 * @typedef {import('../node.js').Sum} Sum
 * @typedef {import('../node.js').Product} Product
 * @typedef {import('../node.js').ProductFactor} ProductFactor
 * @typedef {import('./precision.js').SerializeSession} SerializeSession
 */

// The AST is canonical: sums and products are flat, so these precedence
// levels cover every binary expression
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
    (node.type === 'Sum' && node.grouped === true && groupedRequired === true)
  );
}

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
      emitProduct(node, session);
      return;
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
    emitNode(node.args[i], session);
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
 * @param {import('../node.js').SumTerm} term
 * @param {1 | -1} multiplier
 * @param {number | false} precision
 * @return {1 | -1}
 */
function termSign(term, multiplier, precision) {
  let sign = /** @type {1 | -1} */ (term.sign * multiplier);
  if (isEffectivelyNegative(term.node, precision)) {
    sign = /** @type {1 | -1} */ (-sign);
  }
  return sign;
}

/**
 * @param {import('../node.js').SumTerm} term
 * @param {SerializeSession} session
 * @param {1 | -1} sign
 * @return {void}
 */
function emitSumTerm(term, session, sign) {
  if (sign === 1) {
    emitNode(term.node, session, SUM_PRECEDENCE, true);
  } else {
    emitLeadingNeg(term.node, session);
  }
}

/**
 * @param {import('../node.js').SumTerm[]} terms
 * @param {SerializeSession} session
 * @param {1 | -1} [multiplier]
 * @return {void}
 */
function emitSumTerms(terms, session, multiplier = 1) {
  const buffer = session.buffer;
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const termNode = term.node;
    if (isScalar(termNode)) {
      const effectiveVal = term.sign * multiplier * termNode.value;
      if (Object.is(effectiveVal, -0)) {
        if (i > 0) buffer.push(' + ');
        emitSignedZero(buffer, termNode);
      } else if (isDegenerate(effectiveVal)) {
        const sign = /** @type {1 | -1} */ (term.sign * multiplier);
        if (i === 0) {
          if (sign === -1) buffer.push('-');
          emitScalar(termNode, session);
        } else {
          buffer.push(sign === 1 ? ' + ' : ' - ');
          emitScalar(termNode, session);
        }
      } else {
        const rounded = round(effectiveVal, session.precision);
        if (rounded < 0) {
          if (i === 0) buffer.push('-');
          else buffer.push(' - ');
          emitRoundedScalar(termNode, buffer, -rounded);
        } else {
          if (i > 0) buffer.push(' + ');
          emitRoundedScalar(termNode, buffer, rounded);
        }
      }
      continue;
    }
    const sign = /** @type {1 | -1} */ (term.sign * multiplier);
    if (i === 0) {
      emitSumTerm(term, session, sign);
    } else {
      buffer.push(sign === 1 ? ' + ' : ' - ');
      emitNode(termNode, session, SUM_PRECEDENCE, true);
    }
  }
}

/** @param {Sum} sum @param {SerializeSession} session @return {void} */
function emitSum(sum, session) {
  emitSumTerms(sum.terms, session);
}

/**
 * @param {Node} node
 * @param {SerializeSession} session
 * @return {void}
 */
function emitLeadingNeg(node, session) {
  if (node.type === 'Product') {
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
  let first = true;
  if (coefficientValue !== undefined && coefficientValue !== 1) {
    emitScalar(
      /** @type {import('../node.js').Num} */ (coefficientNode),
      session,
      coefficientValue
    );
    first = false;
  }
  for (let i = start; i < factors.length; i++) {
    const factor = factors[i];
    const factorNode = factor.node;
    if (first) {
      if (factor.exponent === -1) buffer.push('1 / ');
      if (isScalar(factorNode)) emitScalar(factorNode, session);
      else emitNode(factorNode, session, PRODUCT_PRECEDENCE);
      first = false;
    } else {
      buffer.push(factor.exponent === 1 ? ' * ' : ' / ');
      if (isScalar(factorNode)) emitScalar(factorNode, session);
      else emitNode(factorNode, session, PRODUCT_PRECEDENCE);
    }
  }
}

/** @param {Product} product @param {SerializeSession} session @return {void} */
function emitProduct(product, session) {
  emitProductFactors(product.factors, session);
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
    node.type === 'Sum' &&
    node.grouped &&
    node.terms.length > 1 &&
    termSign(node.terms[0], 1, session.precision) === -1
  ) {
    session.buffer.push(wrapper, '(-1 * (');
    emitSumTerms(node.terms, session, -1);
    session.buffer.push('))');
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
  SUM_PRECEDENCE,
  PRODUCT_PRECEDENCE,
  ATOMIC_PRECEDENCE,
  UNARY_PRECEDENCE,
  precedence,
  needsParentheses,
  emitNode,
  emitCall,
  emitOpaqueCall,
  termSign,
  emitSumTerms,
  emitSum,
  emitLeadingNeg,
  emitProductFactors,
  emitProduct,
  emitMathResult,
  emitNestedMathResult,
};
