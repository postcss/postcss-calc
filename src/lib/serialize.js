// Spec: https://www.w3.org/TR/css-values-4/#serialize-a-calculation-tree
// Outer calc() is added when the top-level result contains an arithmetic
// operator, or when a finite scalar needs context-sensitive CSS semantics.

import { checkCalculationDepth } from './limits.js';
import { isCalculationFunction } from './functions.js';
import {
  isScalar,
  serializeNumber,
  roundedScalarValue,
  isDegenerate,
  degenerateKeyword,
} from './serialize/precision.js';
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
 * Serialize a scalar result without allocating a render context or buffer.
 * @param {import('./node.js').Num | import('./node.js').Dim} node
 * @param {number | false} precision
 * @param {'standard' | 'unwrap-all'} scalarPolicy
 * @param {string} wrapper
 * @return {string}
 */
function serializeScalarResult(node, precision, scalarPolicy, wrapper) {
  const value = roundedScalarValue(node, precision);
  const unit = node.type === 'Dim' ? (node.rawUnit ?? node.unit) : '';
  if (isDegenerate(value)) {
    return `${wrapper}(${degenerateKeyword(value)}${unit ? ` * 1${unit}` : ''})`;
  }
  const scalar = serializeNumber(value) + unit;
  return scalarPolicy === 'standard' ? `${wrapper}(${scalar})` : scalar;
}

/**
 * @param {SerializeOptions} opts
 * @return {{buffer: string[], precision: number | false, scalarPolicy: 'standard' | 'unwrap-all'}}
 */
function makeContext(opts) {
  return {
    buffer: [],
    precision: opts.precision ?? 5,
    scalarPolicy: normalizeScalarPolicy(opts),
  };
}

/**
 * @param {Node} node
 * @param {SerializeOptions} opts
 * @return {{kind: 'math', node: Node, session: ReturnType<typeof makeContext>, wrapper: string}}
 */
function planSerialize(node, opts) {
  return {
    kind: 'math',
    node,
    session: makeContext(opts),
    wrapper: opts.calcName ?? 'calc',
  };
}

/**
 * @param {{tree: Node, status: 'resolved' | 'unresolved', rootName: string, rootSpelling: string, calculation?: boolean, original?: string}} result
 * @param {SerializeOptions} opts
 * @return {{kind: 'original', text: string} | {kind: 'root-call', node: Node, session: ReturnType<typeof makeContext>, callNameOverride: string} | {kind: 'wrapped-expr', node: Node, session: ReturnType<typeof makeContext>, wrapper: string} | {kind: 'math', node: Node, session: ReturnType<typeof makeContext>, wrapper: string}}
 */
function planSerializeResult(result, opts) {
  const isCalc = result.calculation ?? isCalculationFunction(result.rootName);
  const normalizedRootName =
    result.calculation === undefined
      ? result.rootName.toLowerCase()
      : result.rootName;
  const wrapper = isCalc
    ? result.rootSpelling || opts.calcName || 'calc'
    : 'calc';
  const session = makeContext(opts);

  if (!isCalc && result.status === 'unresolved') {
    if (
      (result.tree.type === 'Call' || result.tree.type === 'OpaqueCall') &&
      result.tree.name.toLowerCase() === normalizedRootName
    ) {
      return {
        kind: 'root-call',
        node: result.tree,
        session,
        callNameOverride: result.rootSpelling,
      };
    }
    return { kind: 'original', text: result.original ?? '' };
  }

  if (session.scalarPolicy === 'standard') {
    if (isScalar(result.tree))
      return { kind: 'math', node: result.tree, session, wrapper };
    return { kind: 'wrapped-expr', node: result.tree, session, wrapper };
  }
  return { kind: 'math', node: result.tree, session, wrapper };
}

/** @param {Node} node @param {ReturnType<typeof makeContext>} session @return {void} */
function emitRootExpr(node, session) {
  if (node.type === 'Sum' && node.terms.length === 1) {
    emitLeadingNeg(node.terms[0].node, session);
    return;
  }
  emitNode(node, session);
}

/**
 * @param {ReturnType<typeof planSerialize> | ReturnType<typeof planSerializeResult>} renderSpec
 * @return {string}
 */
function emitOutput(renderSpec) {
  if (renderSpec.kind === 'original') return renderSpec.text;
  const { session } = renderSpec;
  if (renderSpec.kind === 'root-call') {
    if (renderSpec.node.type === 'Call') {
      emitCall(renderSpec.node, session, renderSpec.callNameOverride);
    } else {
      emitOpaqueCall(
        /** @type {import('./node.js').OpaqueCall} */ (renderSpec.node),
        session,
        renderSpec.callNameOverride
      );
    }
  } else if (renderSpec.kind === 'wrapped-expr') {
    session.buffer.push(renderSpec.wrapper, '(');
    emitRootExpr(renderSpec.node, session);
    session.buffer.push(')');
  } else {
    emitMathResult(renderSpec.node, session, renderSpec.wrapper);
  }
  return session.buffer.join('');
}

/**
 * @param {Node} node
 * @param {SerializeOptions} [opts]
 * @return {string}
 */
function serialize(node, opts = {}) {
  if (isScalar(node)) {
    return serializeScalarResult(
      node,
      opts.precision ?? 5,
      normalizeScalarPolicy(opts),
      opts.calcName ?? 'calc'
    );
  }
  checkCalculationDepth(node);
  return emitOutput(planSerialize(node, opts));
}

/**
 * @param {{tree: Node, status: 'resolved' | 'unresolved', rootName: string, rootSpelling: string, calculation?: boolean, original?: string}} result
 * @param {SerializeOptions} [opts]
 * @return {string}
 */
function serializeResult(result, opts = {}) {
  const node = result.tree;
  if (isScalar(node)) {
    const isCalc = result.calculation ?? isCalculationFunction(result.rootName);
    if (!isCalc && result.status === 'unresolved') return result.original ?? '';
    const wrapper = isCalc
      ? result.rootSpelling || opts.calcName || 'calc'
      : 'calc';
    return serializeScalarResult(
      node,
      opts.precision ?? 5,
      normalizeScalarPolicy(opts),
      wrapper
    );
  }
  checkCalculationDepth(result.tree);
  return emitOutput(planSerializeResult(result, opts));
}

export { serialize, serializeResult };
