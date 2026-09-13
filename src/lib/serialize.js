// Spec: https://www.w3.org/TR/css-values-4/#serialize-a-calculation-tree
// Outer calc() is added when the top-level result contains an arithmetic
// operator, or when a finite scalar needs context-sensitive CSS semantics.

import { num, dim } from './node.js';
import { getComponents, serializeComponents } from './opaque.js';

/**
 * @typedef {import('./node.js').Node} Node
 * @typedef {import('./node.js').Sum} Sum
 * @typedef {import('./node.js').Product} Product
 * @typedef {import('./node.js').ProductFactor} ProductFactor
 * @typedef {object} SerializeOptions
 * @property {number | false} [precision] Decimal places for numbers. `false` disables rounding. Default 5.
 * @property {string} [calcName] Wrapper name to use when `calc()` is needed. Default `'calc'`.
 * @property {boolean} [unwrapSingleNegativeNumber] Serialize finite negative scalars without a wrapper. Internal selector-only mode.
 * @property {boolean} [unwrapSingleNumber] Serialize finite negative scalars and unitless fractions without a wrapper.
 */

// Below this is float noise, not a value: `0.1 + 0.2 - 0.3` is 5.5e-17.
const NOISE_FLOOR = 1e-12;

/**
 * Rounding to `prec` decimal places turns `calc(1/1000000)` into `0`, and a
 * `0` in CSS is often a switch, not a small number (`flex-grow: 0` never
 * grows). So when a value is too small for `prec`, keep its significant digits
 * instead: `1/1000000` -> `0.000001`, `1/3000000` -> `3.3333e-7`.
 *
 * @param {number} v
 * @param {number | false} prec
 * @return {number}
 */
function round(v, prec) {
  if (prec === false) {
    return v;
  }
  const m = Math.pow(10, prec);
  const rounded = Math.round(v * m) / m;
  if (rounded === 0 && Math.abs(v) > NOISE_FLOOR) {
    // toPrecision needs at least one significant digit; `prec` may be 0.
    return Number(v.toPrecision(Math.max(prec, 1)));
  }
  return rounded;
}

// §10.13 / §10.7.2: Infinity/NaN serialize as canonical keywords.
/**
 * @param {number} v
 * @return {boolean}
 */
function isDegenerate(v) {
  return !Number.isFinite(v) || Number.isNaN(v);
}

/**
 * @param {number} v
 * @return {string}
 */
function degenerateKeyword(v) {
  if (Number.isNaN(v)) {
    return 'NaN';
  }
  return v > 0 ? 'infinity' : '-infinity';
}

/**
 * Serialize a finite CSS number. CSS numbers may omit the zero before a
 * fractional value between -1 and 1 (`.5`, `-.5`). Scientific notation is
 * left untouched because it already has no leading zero to remove.
 *
 * @param {number} v
 * @param {boolean} [censorNegativeZero]
 * @return {string}
 */
function serializeNumber(v, censorNegativeZero = true) {
  if (Object.is(v, -0)) {
    return censorNegativeZero ? '0' : '-0';
  }
  const text = String(v);
  if (text.startsWith('0.')) {
    return text.slice(1);
  }
  if (text.startsWith('-0.')) {
    return `-${text.slice(2)}`;
  }
  return text;
}

/**
 * @param {SerializeOptions} opts
 * @return {'preserve-sensitive' | 'unwrap-negative' | 'unwrap-all'}
 */
function normalizeScalarPolicy(opts) {
  if (opts.unwrapSingleNumber) {
    return 'unwrap-all';
  }
  if (opts.unwrapSingleNegativeNumber) {
    return 'unwrap-negative';
  }
  return 'preserve-sensitive';
}

/**
 * Round and serialize a scalar once so classification and rendering use the
 * same precision-adjusted value and text.
 *
 * @param {import('./node.js').Num | import('./node.js').Dim} node
 * @param {number | false} prec
 * @param {boolean} [censorNegativeZero]
 * @return {{value: number, text: string}}
 */
function formatScalar(node, prec, censorNegativeZero = true) {
  const value = round(node.value, prec);
  const text = `${serializeNumber(value, censorNegativeZero)}${node.type === 'Dim' ? (node.rawUnit ?? node.unit) : ''}`;
  return { value, text };
}

/**
 * Decide whether a top-level scalar must remain in calculation syntax.
 *
 * CSS Values 4 §10 defines math-function behavior, while §10.12 defers range
 * checking until a top-level calculation. Keep those semantics available to
 * the browser for sensitive scalar results. Add future context-sensitive
 * serialization rules here rather than in render branches.
 *
 * @see https://www.w3.org/TR/css-values-4/#math
 * @see https://www.w3.org/TR/css-values-4/#calc-range-checking
 * @see https://www.w3.org/TR/css-values-4/#calc-serialize
 *
 * @param {import('./node.js').Num | import('./node.js').Dim} node
 * @param {{value: number, text: string}} scalar
 * @param {'preserve-sensitive' | 'unwrap-negative' | 'unwrap-all'} policy
 * @return {'bare' | 'calc'}
 */
function classifyScalarResult(node, scalar, policy) {
  // §10.13: Infinity/NaN always require calculation syntax. The specialized
  // dimensional spelling is applied by serializeMathResult below.
  if (isDegenerate(scalar.value)) {
    return 'calc';
  }

  // Unitless fractions need calc() in integer-valued contexts so the browser
  // can perform the required rounding. The legacy negative-only mode keeps
  // that protection; unwrap-all is the explicit escape hatch for selectors.
  if (node.type === 'Num' && !Number.isInteger(scalar.value)) {
    return policy === 'unwrap-all' ? 'bare' : 'calc';
  }

  // Negative dimensions and integral numbers retain the default range-safe
  // behavior. The compatibility modes only change negative scalar output.
  if (scalar.value < 0) {
    return policy === 'preserve-sensitive' ? 'calc' : 'bare';
  }

  return 'bare';
}

/**
 * Render the top-level result after scalar formatting and classification.
 *
 * @param {Node} node
 * @param {{precision: number | false, calcName: string, scalarPolicy: 'preserve-sensitive' | 'unwrap-negative' | 'unwrap-all', censorNegativeZero?: boolean}} context
 * @return {string}
 */
function serializeMathResult(node, context) {
  const {
    precision: prec,
    calcName,
    scalarPolicy,
    censorNegativeZero = true,
  } = context;

  if (node.type === 'Num' || node.type === 'Dim') {
    const scalar = formatScalar(node, prec, censorNegativeZero);
    const syntax = classifyScalarResult(node, scalar, scalarPolicy);

    // §10.13: dimensional Infinity/NaN carry the unit as
    // `<keyword> * 1<unit>` so the result keeps its type.
    if (isDegenerate(scalar.value)) {
      const body =
        node.type === 'Dim'
          ? `${degenerateKeyword(scalar.value)} * 1${node.rawUnit ?? node.unit}`
          : degenerateKeyword(scalar.value);
      return `${calcName}(${body})`;
    }

    return syntax === 'bare' ? scalar.text : `${calcName}(${scalar.text})`;
  }

  // A grouped sum with a leading negative term is the canonical result of
  // negating a parenthesized expression. Re-invert its terms for the body so
  // the grouping survives as `-(...)` instead of becoming `-a - b`.
  if (
    node.type === 'Sum' &&
    node.grouped &&
    node.terms.length > 1 &&
    displaySign(node.terms[0]).sign === -1
  ) {
    const invertedTerms = node.terms.map((t) => ({
      sign: /** @type {1 | -1} */ (-t.sign),
      node: t.node,
    }));
    return `${calcName}(-(${serializeSumTerms(invertedTerms, prec, false)}))`;
  }

  if (node.type === 'Ident' || node.type === 'Call') {
    return serializeExpr(node, prec, false);
  }

  // Single-term Sum is the canonical form for `-var(--x)` / `-(a*b)` —
  // sign=-1 around an opaque node. Signed leaves live in Num/Dim directly.
  if (node.type === 'Sum' && node.terms.length === 1) {
    return `${calcName}(${serializeLeadingNeg(node.terms[0].node, prec, false)})`;
  }

  return `${calcName}(${serializeExpr(node, prec, false)})`;
}

/**
 * @param {Node} node
 * @param {SerializeOptions} [opts]
 * @return {string}
 */
function serialize(node, opts = {}) {
  return serializeMathResult(node, {
    precision: opts.precision ?? 5,
    calcName: opts.calcName ?? 'calc',
    scalarPolicy: normalizeScalarPolicy(opts),
    censorNegativeZero: true,
  });
}

/**
 * Nested calculations keep IEEE-754 signed zero until their enclosing
 * calculation has finished evaluating. Their other scalar context remains
 * the default preserve-sensitive policy.
 *
 * @param {Node} node
 * @param {number | false} prec
 * @return {string}
 */
function serializeNestedMathResult(node, prec) {
  return serializeMathResult(node, {
    precision: prec,
    calcName: 'calc',
    scalarPolicy: 'preserve-sensitive',
    censorNegativeZero: false,
  });
}

// --- Inside calc() expression --------------------------------------------

/**
 * @param {Node} node
 * @param {number | false} prec
 * @param {boolean} [censorNegativeZero]
 * @return {string}
 */
function serializeExpr(node, prec, censorNegativeZero = true) {
  switch (node.type) {
    case 'Num':
      if (isDegenerate(node.value)) {
        return degenerateKeyword(node.value);
      }
      return formatScalar(node, prec, censorNegativeZero).text;
    case 'Dim':
      if (isDegenerate(node.value)) {
        // Nested degenerate Dim wraps in calc() so the `<kw> * 1<unit>` form
        // parses back as one Dim factor. The bare form round-trips wrong
        // inside a Product — `0 * Dim(Infinity, px)` would re-fold as NaN.
        return `calc(${degenerateKeyword(node.value)} * 1${node.rawUnit ?? node.unit})`;
      }
      return formatScalar(node, prec, censorNegativeZero).text;
    case 'Ident':
      return node.rawName ?? node.name;
    case 'Call': {
      const components = getComponents(node);
      if (components) {
        const args = node.args
          .map((arg) => serializeExpr(arg, prec, false))
          .join(', ');
        return `${node.rawName ?? node.name}(${args}${serializeComponents(components, (child) => serializeNestedMathResult(child, prec))})`;
      }
      const args = node.args
        .map((a) => serializeExpr(a, prec, false))
        .join(', ');
      return `${node.rawName ?? node.name}(${args})`;
    }
    case 'Sum':
      return serializeSum(node, prec, censorNegativeZero);
    case 'Product':
      return serializeProduct(node, prec, censorNegativeZero);
  }
}

/**
 * Combine the term's sign with a negative Num/Dim value's sign so
 * `{sign:+1, Num(-5)}` renders as `-5`, not `+ -5`. Skip degenerate
 * (Infinity/NaN) values — the `degenerateKeyword` path emits `-infinity`
 * inline, and a leading minus on `calc(infinity*1<unit>)` would now
 * tokenize as a `-calc` function.
 * @param {{sign: 1 | -1, node: Node}} term
 * @return {{sign: 1 | -1, magnitude: Node}}
 */
function displaySign(term) {
  const { sign, node } = term;
  if (node.type === 'Num' && Number.isFinite(node.value) && node.value < 0) {
    return {
      sign: /** @type {1 | -1} */ (-sign),
      magnitude: num(-node.value),
    };
  }
  if (node.type === 'Dim' && Number.isFinite(node.value) && node.value < 0) {
    return {
      sign: /** @type {1 | -1} */ (-sign),
      magnitude: dim(-node.value, node.unit, node.rawUnit),
    };
  }
  return { sign, magnitude: node };
}

/**
 * @param {import('./node.js').SumTerm[]} terms
 * @param {number | false} prec
 * @param {boolean} [censorNegativeZero]
 * @return {string}
 */
function serializeSumTerms(terms, prec, censorNegativeZero = true) {
  let out = '';
  for (let i = 0; i < terms.length; i++) {
    const { sign, magnitude } = displaySign(terms[i]);
    if (i === 0) {
      if (magnitude.type === 'Sum' && magnitude.grouped) {
        const body = `(${serializeExpr(magnitude, prec, censorNegativeZero)})`;
        out = sign === 1 ? body : `-${body}`;
        continue;
      }
      out =
        sign === 1
          ? serializeExpr(magnitude, prec, censorNegativeZero)
          : serializeLeadingNeg(magnitude, prec, censorNegativeZero);
    } else {
      // `-` binds looser than `*`/`/` so the right side never needs parens.
      let body = serializeExpr(magnitude, prec, censorNegativeZero);
      if (magnitude.type === 'Sum' && magnitude.grouped) {
        body = `(${body})`;
      }
      out += sign === 1 ? ` + ${body}` : ` - ${body}`;
    }
  }
  return out;
}

/**
 * @param {Sum} sum
 * @param {number | false} prec
 * @param {boolean} [censorNegativeZero]
 * @return {string}
 */
function serializeSum(sum, prec, censorNegativeZero = true) {
  return serializeSumTerms(sum.terms, prec, censorNegativeZero);
}

/**
 * Fold a leading negation into a finite leading Num if there is one
 * (`-(0.5 * x)` → `-0.5 * x`); else use `-(…)` for Sum/Product or `-x`.
 * @param {Node} node
 * @param {number | false} prec
 * @param {boolean} [censorNegativeZero]
 * @return {string}
 */
function serializeLeadingNeg(node, prec, censorNegativeZero = true) {
  if (
    node.type === 'Product' &&
    node.factors.length > 0 &&
    node.factors[0].exponent === 1 &&
    node.factors[0].node.type === 'Num' &&
    Number.isFinite(node.factors[0].node.value) &&
    node.factors[0].node.value !== 0
  ) {
    const head = node.factors[0].node;
    const negatedValue = -head.value;
    const rest = node.factors.slice(1);
    // A coefficient of 1 is a no-op factor, matching mkProduct.
    /** @type {ProductFactor[]} */
    const negatedFactors =
      negatedValue === 1
        ? rest
        : [{ exponent: 1, node: num(negatedValue) }, ...rest];
    return serializeFactors(negatedFactors, prec, censorNegativeZero);
  }
  const body = serializeExpr(node, prec, censorNegativeZero);
  return node.type === 'Sum' || node.type === 'Product'
    ? `-(${body})`
    : `-${body}`;
}

/**
 * @param {ProductFactor[]} factors
 * @param {number | false} prec
 * @param {boolean} [censorNegativeZero]
 * @return {string}
 */
function serializeFactors(factors, prec, censorNegativeZero = true) {
  let out = '';
  for (let i = 0; i < factors.length; i++) {
    const f = factors[i];
    let body = serializeExpr(f.node, prec, censorNegativeZero);
    // A Sum factor needs parens: `a * (b + c)`. Flat canonical form means
    // this is the only place parens are required.
    if (f.node.type === 'Sum') {
      body = `(${body})`;
    }
    if (i === 0) {
      // Leading denominator: implicit 1 so we emit `1 / 2px`, not `/ 2px`.
      out = f.exponent === 1 ? body : `1 / ${body}`;
    } else {
      out += f.exponent === 1 ? ` * ${body}` : ` / ${body}`;
    }
  }
  return out;
}

/**
 * @param {Product} product
 * @param {number | false} prec
 * @param {boolean} [censorNegativeZero]
 * @return {string}
 */
function serializeProduct(product, prec, censorNegativeZero = true) {
  return serializeFactors(product.factors, prec, censorNegativeZero);
}

export { serialize };
