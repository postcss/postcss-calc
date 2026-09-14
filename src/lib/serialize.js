// Spec: https://www.w3.org/TR/css-values-4/#serialize-a-calculation-tree
// Outer calc() is added when the top-level result contains an arithmetic
// operator, or when a finite scalar needs context-sensitive CSS semantics.

import { num, dim } from './node.js';
import { serializeComponents } from './opaque.js';
import { checkCalculationDepth } from './limits.js';

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
 * @return {string}
 */
function serializeNumber(v) {
  if (Object.is(v, -0)) {
    return '0';
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
 * @return {'standard' | 'unwrap-all'}
 */
function normalizeScalarPolicy(opts) {
  if (opts.unwrapSingleValue || opts.unwrapSingleNegativeNumber) {
    return 'unwrap-all';
  }
  return 'standard';
}

/**
 * Round and serialize a scalar once so classification and rendering use the
 * same precision-adjusted value and text.
 *
 * @param {import('./node.js').Num | import('./node.js').Dim} node
 * @param {{precision: number | false}} formatting
 * @return {{value: number, text: string}}
 */
function formatScalar(node, formatting) {
  const value = round(node.value, formatting.precision);
  const text = `${serializeNumber(value)}${node.type === 'Dim' ? (node.rawUnit ?? node.unit) : ''}`;
  return { value, text };
}

/**
 * An exact signed-zero leaf is observable when its enclosing calculation
 * continues evaluating (for example, through division or min()). CSS source
 * cannot spell that value as a literal `-0`, so recreate it with a nested
 * atomic calculation instead.
 *
 * @param {import('./node.js').Num | import('./node.js').Dim} node
 * @return {string}
 */
function serializeSignedZero(node) {
  const unit = node.type === 'Dim' ? (node.rawUnit ?? node.unit) : '';
  return `calc(-1 * 0${unit})`;
}

/**
 * @param {Node} node
 * @return {node is import('./node.js').Num | import('./node.js').Dim}
 */
function isSignedZero(node) {
  return (
    (node.type === 'Num' || node.type === 'Dim') && Object.is(node.value, -0)
  );
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
 * @param {{value: number, text: string}} scalar
 * @param {'standard' | 'unwrap-all'} policy
 * @return {'bare' | 'calc'}
 */
function classifyScalarResult(scalar, policy) {
  // §10.13: Infinity/NaN always require calculation syntax. The specialized
  // dimensional spelling is applied by serializeMathResult below.
  if (isDegenerate(scalar.value)) {
    return 'calc';
  }

  if (policy === 'standard') {
    return 'calc';
  }

  // The explicit escape hatch is used only where calculation syntax cannot
  // remain or where the caller accepts losing context-sensitive semantics.
  return 'bare';
}

/**
 * Render the top-level result after scalar formatting and classification.
 *
 * @param {Node} node
 * @param {{calcName: string, scalarPolicy: 'standard' | 'unwrap-all', formatting: {precision: number | false}}} context
 * @return {string}
 */
function serializeMathResult(node, context) {
  const { calcName, scalarPolicy } = context;
  const formatting = context.formatting;
  /** @param {Node} child */
  const serializeOpaqueComponent = (child) =>
    serializeNestedMathResult(child, formatting.precision, scalarPolicy);

  if (node.type === 'Num' || node.type === 'Dim') {
    const scalar = formatScalar(node, formatting);
    const syntax = classifyScalarResult(scalar, scalarPolicy);

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
    return `${calcName}(-(${serializeSumTerms(invertedTerms, formatting, serializeOpaqueComponent)}))`;
  }

  if (
    node.type === 'Ident' ||
    node.type === 'Call' ||
    node.type === 'OpaqueCall'
  ) {
    return serializeExpr(node, formatting, serializeOpaqueComponent);
  }

  // Single-term Sum is the canonical form for `-var(--x)` / `-(a*b)` —
  // sign=-1 around an opaque node. Signed leaves live in Num/Dim directly.
  if (node.type === 'Sum' && node.terms.length === 1) {
    return `${calcName}(${serializeLeadingNeg(node.terms[0].node, formatting, serializeOpaqueComponent)})`;
  }

  return `${calcName}(${serializeExpr(node, formatting, serializeOpaqueComponent)})`;
}

/**
 * @param {Node} node
 * @param {SerializeOptions} [opts]
 * @return {string}
 */
function serialize(node, opts = {}) {
  checkCalculationDepth(node);
  return serializeMathResult(node, {
    calcName: opts.calcName ?? 'calc',
    scalarPolicy: normalizeScalarPolicy(opts),
    formatting: {
      precision: opts.precision ?? 5,
    },
  });
}

/**
 * @param {{tree: Node, status: 'resolved' | 'unresolved', rootName: string, rootSpelling: string, original: string}} result
 * @param {SerializeOptions} [opts]
 * @return {string}
 */
function serializeResult(result, opts = {}) {
  checkCalculationDepth(result.tree);
  const precision = opts.precision ?? 5;
  const unwrapSingleValue =
    opts.unwrapSingleValue || opts.unwrapSingleNegativeNumber;
  const isCalc = /^(?:-(?:moz|webkit)-)?calc$/i.test(result.rootName);
  // Preserve vendor-prefixed spelling whenever the root still needs a calc.
  const wrapper = isCalc
    ? result.rootSpelling || opts.calcName || 'calc'
    : 'calc';
  const tree = result.tree;

  if (!isCalc && result.status === 'unresolved') {
    if (
      (tree.type === 'Call' || tree.type === 'OpaqueCall') &&
      tree.name.toLowerCase() === result.rootName.toLowerCase()
    ) {
      const rendered = serializeExpr(tree, { precision }, (child) =>
        serializeNestedMathResult(
          child,
          precision,
          unwrapSingleValue ? 'unwrap-all' : 'standard'
        )
      );
      // Simplifiers deliberately normalize their fallback call names. At the
      // reduction boundary, retain the root token exactly as it appeared in
      // source so an unresolved `SIN()` does not become `sin()`.
      return `${result.rootSpelling}${rendered.slice(rendered.indexOf('('))}`;
    }
    return result.original;
  }

  if (!unwrapSingleValue) {
    // Scalar results are the final calculation boundary, so normalize their
    // signed zero here. Degenerate dimensions also need their specialized
    // `<keyword> * 1<unit>` calculation spelling.
    if (tree.type === 'Num' || tree.type === 'Dim') {
      return serializeMathResult(tree, {
        calcName: wrapper,
        scalarPolicy: 'standard',
        formatting: { precision },
      });
    }
    return `${wrapper}(${serializeRootExpr(tree, { precision }, (child) =>
      serializeNestedMathResult(child, precision, 'standard')
    )})`;
  }

  return serializeMathResult(tree, {
    calcName: wrapper,
    scalarPolicy: 'unwrap-all',
    formatting: { precision },
  });
}

/**
 * Render a root expression body while retaining the canonical grouped-sum
 * rule. Wrapper selection belongs to serializeResult; this function only
 * renders the tree.
 * @param {Node} node
 * @param {{precision: number | false}} formatting
 * @param {(node: Node) => string} serializeOpaqueComponent
 * @return {string}
 */
function serializeRootExpr(node, formatting, serializeOpaqueComponent) {
  if (
    node.type === 'Sum' &&
    node.grouped &&
    node.terms.length > 1 &&
    displaySign(node.terms[0]).sign === -1
  ) {
    const invertedTerms = node.terms.map((term) => ({
      sign: /** @type {1 | -1} */ (-term.sign),
      node: term.node,
    }));
    return `-(${serializeSumTerms(invertedTerms, formatting, serializeOpaqueComponent)})`;
  }
  if (node.type === 'Sum' && node.terms.length === 1) {
    return serializeLeadingNeg(
      node.terms[0].node,
      formatting,
      serializeOpaqueComponent
    );
  }
  return serializeExpr(node, formatting, serializeOpaqueComponent);
}

/**
 * Nested calculations keep IEEE-754 signed zero until their enclosing
 * calculation has finished evaluating. Their other scalar context remains
 * the standard policy.
 *
 * @param {Node} node
 * @param {number | false} precision
 * @param {'standard' | 'unwrap-all'} scalarPolicy
 * @return {string}
 */
function serializeNestedMathResult(node, precision, scalarPolicy) {
  // This callback crosses into opaque component syntax. A normal scalar may
  // obey unwrapSingleValue here, but unwrapping an exact -0 would erase its
  // sign before the opaque function can evaluate it.
  if (isSignedZero(node)) {
    return serializeSignedZero(node);
  }
  return serializeMathResult(node, {
    calcName: 'calc',
    scalarPolicy,
    formatting: { precision },
  });
}

// --- Inside calc() expression --------------------------------------------

/**
 * @param {Node} node
 * @param {{precision: number | false}} formatting
 * @param {(node: Node) => string} serializeOpaqueComponent
 * @return {string}
 */
function serializeExpr(node, formatting, serializeOpaqueComponent) {
  switch (node.type) {
    case 'Num':
      if (Object.is(node.value, -0)) {
        return serializeSignedZero(node);
      }
      if (isDegenerate(node.value)) {
        return degenerateKeyword(node.value);
      }
      return formatScalar(node, formatting).text;
    case 'Dim':
      if (Object.is(node.value, -0)) {
        return serializeSignedZero(node);
      }
      if (isDegenerate(node.value)) {
        // Nested degenerate Dim wraps in calc() so the `<kw> * 1<unit>` form
        // parses back as one Dim factor. The bare form round-trips wrong
        // inside a Product — `0 * Dim(Infinity, px)` would re-fold as NaN.
        return `calc(${degenerateKeyword(node.value)} * 1${node.rawUnit ?? node.unit})`;
      }
      return formatScalar(node, formatting).text;
    case 'Ident':
      return node.rawName ?? node.name;
    case 'Call': {
      const args = node.args
        .map((arg) => serializeExpr(arg, formatting, serializeOpaqueComponent))
        .join(', ');
      return `${node.rawName ?? node.name}(${args})`;
    }
    case 'OpaqueCall':
      return `${node.rawName ?? node.name}(${serializeComponents(node.components, serializeOpaqueComponent)})`;
    case 'Sum':
      return serializeSum(node, formatting, serializeOpaqueComponent);
    case 'Product':
      return serializeProduct(node, formatting, serializeOpaqueComponent);
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
 * @param {{precision: number | false}} formatting
 * @param {(node: Node) => string} serializeOpaqueComponent
 * @return {string}
 */
function serializeSumTerms(terms, formatting, serializeOpaqueComponent) {
  let out = '';
  for (let i = 0; i < terms.length; i++) {
    const { sign, magnitude } = displaySign(terms[i]);
    if (i === 0) {
      if (magnitude.type === 'Sum' && magnitude.grouped) {
        const body = `(${serializeExpr(magnitude, formatting, serializeOpaqueComponent)})`;
        out = sign === 1 ? body : `-${body}`;
        continue;
      }
      out =
        sign === 1
          ? serializeExpr(magnitude, formatting, serializeOpaqueComponent)
          : serializeLeadingNeg(
              magnitude,
              formatting,
              serializeOpaqueComponent
            );
    } else {
      // `-` binds looser than `*`/`/` so the right side never needs parens.
      let body = serializeExpr(magnitude, formatting, serializeOpaqueComponent);
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
 * @param {{precision: number | false}} formatting
 * @param {(node: Node) => string} serializeOpaqueComponent
 * @return {string}
 */
function serializeSum(sum, formatting, serializeOpaqueComponent) {
  return serializeSumTerms(sum.terms, formatting, serializeOpaqueComponent);
}

/**
 * Fold a leading negation into a finite leading Num if there is one
 * (`-(0.5 * x)` → `-0.5 * x`); else use `-(…)` for Sum/Product or `-x`.
 * @param {Node} node
 * @param {{precision: number | false}} formatting
 * @param {(node: Node) => string} serializeOpaqueComponent
 * @return {string}
 */
function serializeLeadingNeg(node, formatting, serializeOpaqueComponent) {
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
    return serializeFactors(
      negatedFactors,
      formatting,
      serializeOpaqueComponent
    );
  }
  const body = serializeExpr(node, formatting, serializeOpaqueComponent);
  return node.type === 'Sum' || node.type === 'Product'
    ? `-(${body})`
    : `-${body}`;
}

/**
 * @param {ProductFactor[]} factors
 * @param {{precision: number | false}} formatting
 * @param {(node: Node) => string} serializeOpaqueComponent
 * @return {string}
 */
function serializeFactors(factors, formatting, serializeOpaqueComponent) {
  let out = '';
  for (let i = 0; i < factors.length; i++) {
    const f = factors[i];
    let body = serializeExpr(f.node, formatting, serializeOpaqueComponent);
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
 * @param {{precision: number | false}} formatting
 * @param {(node: Node) => string} serializeOpaqueComponent
 * @return {string}
 */
function serializeProduct(product, formatting, serializeOpaqueComponent) {
  return serializeFactors(
    product.factors,
    formatting,
    serializeOpaqueComponent
  );
}

export { serialize, serializeResult };
