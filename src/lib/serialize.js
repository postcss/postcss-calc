// Spec: https://www.w3.org/TR/css-values-4/#serialize-a-calculation-tree
// Outer calc() is added when the top-level result contains an arithmetic
// operator, or when a finite scalar needs context-sensitive CSS semantics.

import { serializeComponents } from './opaque.js';
import { checkCalculationDepth } from './limits.js';
import { isCalculationFunction } from './functions.js';

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

// The AST is canonical: sums and products are flat, so these precedence
// levels cover every binary expression
const SUM_PRECEDENCE = 1;
const PRODUCT_PRECEDENCE = 2;
const ATOMIC_PRECEDENCE = 3;
// Unary minus binds more tightly than a sum but has the same atomic boundary
// for deciding whether `-x` needs parentheses.
const UNARY_PRECEDENCE = ATOMIC_PRECEDENCE;
const NOISE_FLOOR = 1e-12;

/**
 * Divide a decimal digit string by 10^k, rounding half away from zero, and
 * return the resulting integer digit string. `digits` has no leading zeros.
 * @param {string} digits
 * @param {number} k
 * @return {string}
 */
function divideByPowerOfTen(digits, k) {
  // 0x30/0x35/0x39 are the char codes of '0'/'5'/'9'.
  if (digits.length <= k) {
    return digits.length === k && digits.charCodeAt(0) >= 0x35 ? '1' : '0';
  }
  const cut = digits.length - k;
  if (digits.charCodeAt(cut) < 0x35) return digits.slice(0, cut);
  // Round up and propagate the carry through trailing nines.
  let index = cut - 1;
  while (index >= 0 && digits.charCodeAt(index) === 0x39) index--;
  if (index < 0) return `1${'0'.repeat(cut)}`;
  return `${digits.slice(0, index)}${String.fromCharCode(
    digits.charCodeAt(index) + 1
  )}${'0'.repeat(cut - index - 1)}`;
}

/**
 * Round the shortest decimal representation of a non-negative double to `p`
 * fractional digits, half away from zero.
 *
 * `Number(text + 'e' + p)` reads the exact intended decimal (so `1.005` at
 * precision 2 becomes `1.01`), but it is only exact while the shifted value
 * fits in `Number.MAX_SAFE_INTEGER`; beyond that the intermediate double
 * rounds and can move the rounding boundary (e.g. `312834450754803.44` at
 * precision 1 or 6 drifted to `312834450754803.5`). Round the decimal digits
 * directly instead.
 *
 * @param {number} abs
 * @param {number} p
 * @return {number}
 */
function roundDecimal(abs, p) {
  const text = String(abs);
  const eIdx = text.indexOf('e');
  const mantissa = eIdx === -1 ? text : text.slice(0, eIdx);
  let exponent = eIdx === -1 ? 0 : Number(text.slice(eIdx + 1));
  const dot = mantissa.indexOf('.');
  let digits = mantissa;
  if (dot !== -1) {
    digits = mantissa.slice(0, dot) + mantissa.slice(dot + 1);
    exponent -= mantissa.length - dot - 1;
  }

  // value = digits * 10^exponent, so the shortest decimal has -exponent
  // fractional digits when it is smaller than 1.
  if (exponent >= -p) return abs;

  let start = 0;
  while (start < digits.length - 1 && digits.charCodeAt(start) === 0x30)
    start++;
  const rounded = divideByPowerOfTen(digits.slice(start), -(exponent + p));
  return Number(`${rounded}e-${p}`);
}

/**
 * @param {number} v
 * @param {number | false} prec
 * @return {number}
 */
function round(v, prec) {
  if (prec === false || !Number.isFinite(v)) return v;
  if (Object.is(v, -0) || v === 0) return v;
  const abs = Math.abs(v);
  // Numbers >= MAX_SAFE_INTEGER (2^53 - 1) cannot represent fractional values, and
  // integers already have 0 fractional places. Bypassing them avoids float drift.
  if (abs >= Number.MAX_SAFE_INTEGER || Number.isInteger(v)) return v;

  // Clamp precision to [0, 100] integer to prevent NaN from fractional precisions
  // or exponent overflows into Infinity/NaN (e.g. exponent + prec > 308).
  const p = Math.min(100, Math.max(0, Math.trunc(prec)));
  const sign = v < 0 ? -1 : 1;
  // Fast path: rounding to integer with "round half away from zero".
  const rounded =
    p === 0 ? sign * Math.round(abs) : sign * roundDecimal(abs, p);

  // Preserve non-zero values smaller than precision (e.g. 1/1000000) from collapsing
  // to zero, while still snapping true floating-point dust (< 1e-12) to zero.
  if (rounded === 0 && abs > NOISE_FLOOR) {
    return Number(v.toPrecision(Math.max(p, 1)));
  }
  return rounded;
}

// §10.13 / §10.7.2: Infinity/NaN serialize as canonical keywords.
/** @param {number} v @return {boolean} */
function isDegenerate(v) {
  return !Number.isFinite(v) || Number.isNaN(v);
}

/** @param {number} v @return {string} */
function degenerateKeyword(v) {
  if (Number.isNaN(v)) return 'NaN';
  return v > 0 ? 'infinity' : '-infinity';
}

/** @param {number} v @return {string} */
function serializeNumber(v) {
  if (Object.is(v, -0)) return '0';
  const text = String(v);
  if (text.startsWith('0.')) return text.slice(1);
  if (text.startsWith('-0.')) return `-${text.slice(2)}`;
  return text;
}

/** @param {SerializeOptions} opts @return {'standard' | 'unwrap-all'} */
function normalizeScalarPolicy(opts) {
  return opts.unwrapSingleValue || opts.unwrapSingleNegativeNumber
    ? 'unwrap-all'
    : 'standard';
}

/**
 * @param {import('./node.js').Num | import('./node.js').Dim} node
 * @param {number | false} precision
 * @param {number} [value]
 * @return {number}
 */
function roundedScalarValue(node, precision, value) {
  return round(value ?? node.value, precision);
}

/**
 * @param {import('./node.js').Num | import('./node.js').Dim} node
 * @param {string[]} buffer
 * @param {number} value
 * @return {void}
 */
function emitRoundedScalar(node, buffer, value) {
  buffer.push(serializeNumber(value));
  if (node.type === 'Dim') {
    buffer.push(node.rawUnit ?? node.unit);
  }
}

/**
 * @param {import('./node.js').Num | import('./node.js').Dim} node
 * @param {ReturnType<typeof makeContext>} session
 * @param {number} [value]
 * @return {number}
 */
function emitFiniteScalar(node, session, value) {
  const rounded = roundedScalarValue(node, session.precision, value);
  emitRoundedScalar(node, session.buffer, rounded);
  return rounded;
}

/**
 * @param {import('./node.js').Num | import('./node.js').Dim} node
 * @param {ReturnType<typeof makeContext>} session
 * @param {number} [value]
 * @return {void}
 */
function emitScalar(node, session, value) {
  const buffer = session.buffer;
  if (Object.is(node.value, -0)) emitSignedZero(buffer, node);
  else if (isDegenerate(node.value)) {
    if (node.type === 'Dim') {
      buffer.push(
        'calc(',
        degenerateKeyword(node.value),
        ' * 1',
        node.rawUnit ?? node.unit,
        ')'
      );
    } else {
      buffer.push(degenerateKeyword(node.value));
    }
  } else emitFiniteScalar(node, session, value);
}

/**
 * @param {string[]} buffer
 * @param {import('./node.js').Num | import('./node.js').Dim} node
 * @return {void}
 */
function emitSignedZero(buffer, node) {
  const unit = node.type === 'Dim' ? (node.rawUnit ?? node.unit) : '';
  buffer.push('calc(-1 * 0', unit, ')');
}

/** @param {Node} node @return {node is import('./node.js').Num | import('./node.js').Dim} */
function isScalar(node) {
  return node.type === 'Num' || node.type === 'Dim';
}

/** @param {Node} node @return {node is import('./node.js').Num | import('./node.js').Dim} */
function isSignedZero(node) {
  return isScalar(node) ? Object.is(node.value, -0) : false;
}

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
 * @param {ReturnType<typeof makeContext>} session
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
 * @param {ReturnType<typeof makeContext>} session
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
 * @param {import('./node.js').Call} node
 * @param {ReturnType<typeof makeContext>} session
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
 * @param {import('./node.js').OpaqueCall} node
 * @param {ReturnType<typeof makeContext>} session
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
 * Whether a scalar node is strictly negative after precision rounding
 * (excluding signed zero and sub-precision values that round to zero).
 * @param {Node} node
 * @param {number | false} precision
 * @return {node is import('./node.js').Num | import('./node.js').Dim}
 */
function isEffectivelyNegative(node, precision) {
  return (
    isScalar(node) &&
    !Object.is(node.value, -0) &&
    Number.isFinite(node.value) &&
    round(node.value, precision) < 0
  );
}

/**
 * @param {import('./node.js').SumTerm} term
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
 * @param {import('./node.js').SumTerm} term
 * @param {ReturnType<typeof makeContext>} session
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
 * @param {import('./node.js').SumTerm[]} terms
 * @param {ReturnType<typeof makeContext>} session
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

/** @param {Sum} sum @param {ReturnType<typeof makeContext>} session @return {void} */
function emitSum(sum, session) {
  emitSumTerms(sum.terms, session);
}

/**
 * @param {Node} node
 * @param {ReturnType<typeof makeContext>} session
 * @return {void}
 */
function emitLeadingNeg(node, session) {
  if (
    node.type === 'Product' &&
    node.factors.length > 0 &&
    node.factors[0].exponent === 1 &&
    node.factors[0].node.type === 'Num' &&
    Number.isFinite(node.factors[0].node.value) &&
    node.factors[0].node.value !== 0
  ) {
    const head = node.factors[0].node;
    emitProductFactors(node.factors, session, 1, -head.value, head);
    return;
  }
  session.buffer.push('-');
  emitNode(node, session, UNARY_PRECEDENCE, false);
}

/**
 * @param {ProductFactor[]} factors
 * @param {ReturnType<typeof makeContext>} session
 * @param {number} [start]
 * @param {number} [coefficientValue]
 * @param {import('./node.js').Num} [coefficientNode]
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
      /** @type {import('./node.js').Num} */ (coefficientNode),
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

/** @param {Product} product @param {ReturnType<typeof makeContext>} session @return {void} */
function emitProduct(product, session) {
  emitProductFactors(product.factors, session);
}

/** @param {Node} node @param {ReturnType<typeof makeContext>} session @return {void} */
function emitRootExpr(node, session) {
  if (
    node.type === 'Sum' &&
    node.grouped &&
    node.terms.length > 1 &&
    termSign(node.terms[0], 1, session.precision) === -1
  ) {
    session.buffer.push('-(');
    emitSumTerms(node.terms, session, -1);
    session.buffer.push(')');
    return;
  }
  if (node.type === 'Sum' && node.terms.length === 1) {
    emitLeadingNeg(node.terms[0].node, session);
    return;
  }
  emitNode(node, session);
}

/**
 * @param {Node} node
 * @param {ReturnType<typeof makeContext>} session
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
    session.buffer.push(wrapper, '(-(');
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
 * @param {Node} node
 * @param {ReturnType<typeof makeContext>} session
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

/**
 * @param {ReturnType<typeof planSerialize> | ReturnType<typeof planSerializeResult>} renderSpec
 * @return {string}
 * */
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
