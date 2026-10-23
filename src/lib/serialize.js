// Spec: https://www.w3.org/TR/css-values-4/#serialize-a-calculation-tree
// Outer calc() is added when the top-level result contains an arithmetic
// operator, or when a finite scalar needs context-sensitive CSS semantics.

import { checkCalculationDepth } from './limits.js';
import { isCalculationFunction } from './functions.js';
import { isScalar } from './serialize/precision.js';
import {
  emitCall,
  emitLeadingNeg,
  emitOpaqueCall,
  emitMathResult,
  emitNode,
} from './serialize/expression.js';

/**
 * @typedef {import('./node.js').Node} Node
 * @typedef {import('./node.js').Sum} Sum
 * @typedef {import('./node.js').Product} Product
 * @typedef {import('./node.js').ProductFactor} ProductFactor
 * @typedef {object} SerializeOptions
 * @property {number | false} [precision] Decimal places for numbers. `false` disables rounding. Default 5.
 * @property {string} [calcName] Wrapper name to use when `calc()` is needed. Default `'calc'`.
 * @property {boolean} [unwrapSingleNegativeNumber] Deprecated alias for `unwrapSingleValue`.
 * @property {boolean} [unwrapSingleValue] Serialize fully resolved finite scalar results without calculation syntax.
 */

/** @param {SerializeOptions} opts @return {'standard' | 'unwrap-all'} */
function normalizeScalarPolicy(opts) {
  return opts.unwrapSingleValue || opts.unwrapSingleNegativeNumber
    ? 'unwrap-all'
    : 'standard';
}

/**
 * @param {SerializeOptions} opts
 * @return {import('./serialize/precision.js').SerializeSession}
 */
function makeSession(opts) {
  return {
    buffer: [],
    precision: opts.precision ?? 5,
    scalarPolicy: normalizeScalarPolicy(opts),
  };
}

/** @param {Node} node @param {import('./serialize/precision.js').SerializeSession} session @return {void} */
function emitRootExpr(node, session) {
  if (node.type === 'Sum' && node.terms.length === 1) {
    emitLeadingNeg(node.terms[0].node, session);
    return;
  }
  emitNode(node, session);
}

/**
 * @param {Node} node
 * @param {SerializeOptions} [opts]
 * @return {string}
 */
function serialize(node, opts = {}) {
  checkCalculationDepth(node);
  const session = makeSession(opts);
  emitMathResult(node, session, opts.calcName ?? 'calc');
  return session.buffer.join('');
}

/**
 * @param {{tree: Node, status: 'resolved' | 'unresolved', rootName: string, rootSpelling: string, calculation?: boolean, original?: string}} result
 * @param {SerializeOptions} [opts]
 * @return {string}
 */
function serializeResult(result, opts = {}) {
  const node = result.tree;
  checkCalculationDepth(node);
  const isCalc = result.calculation ?? isCalculationFunction(result.rootName);
  const session = makeSession(opts);

  if (!isCalc && result.status === 'unresolved') {
    const rootName =
      result.calculation === undefined
        ? result.rootName.toLowerCase()
        : result.rootName;
    if (
      (node.type === 'Call' || node.type === 'OpaqueCall') &&
      node.name.toLowerCase() === rootName
    ) {
      if (node.type === 'Call') emitCall(node, session, result.rootSpelling);
      else emitOpaqueCall(node, session, result.rootSpelling);
      return session.buffer.join('');
    }
    return result.original ?? '';
  }

  const wrapper = isCalc
    ? result.rootSpelling || opts.calcName || 'calc'
    : 'calc';
  // Under the standard policy a bare Ident/Call result still needs calc().
  if (session.scalarPolicy === 'standard' && !isScalar(node)) {
    session.buffer.push(wrapper, '(');
    emitRootExpr(node, session);
    session.buffer.push(')');
  } else {
    emitMathResult(node, session, wrapper);
  }
  return session.buffer.join('');
}

export { serialize, serializeResult };
