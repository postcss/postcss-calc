'use strict';

// Spec: https://www.w3.org/TR/css-values-4/#serialize-a-calculation-tree
// Outer calc() is added only when the top-level result contains an
// arithmetic operator. A Sum inside a Product is the only place parens
// are ever required on valid canonical input.

/**
 * @typedef {import('./node.js').Node} Node
 * @typedef {import('./node.js').Sum} Sum
 * @typedef {import('./node.js').Product} Product
 * @typedef {import('./node.js').ProductFactor} ProductFactor
 * @typedef {object} SerializeOptions
 * @property {number | false} [precision] Decimal places for numbers. `false` disables rounding. Default 5.
 * @property {string} [calcName] Wrapper name to use when `calc()` is needed. Default `'calc'`.
 */

/**
 * @param {number} v
 * @param {number | false} prec
 * @return {number}
 */
function round(v, prec) {
  if (prec === false) {
    return v;
  }
  const m = Math.pow(10, prec);
  return Math.round(v * m) / m;
}

// §10.13 / §10.7.2: Infinity/NaN serialize as canonical keywords.
/**
 * @param {number} v
 * @return {boolean}
 */
function isDegenerate(v) {
  return !isFinite(v) || isNaN(v);
}

/**
 * @param {number} v
 * @return {string}
 */
function degenerateKeyword(v) {
  if (isNaN(v)) {return 'NaN';}
  return v > 0 ? 'infinity' : '-infinity';
}

/**
 * @param {Node} node
 * @param {SerializeOptions} [opts]
 * @return {string}
 */
function serialize(node, opts = {}) {
  const prec = opts.precision ?? 5;
  const calcName = opts.calcName ?? 'calc';

  // §10.13: top-level Infinity/NaN wrap in calc(); dim degenerates carry
  // the unit as `<keyword> * 1<unit>` so the result keeps its type.
  if (node.type === 'Num' && isDegenerate(node.value)) {
    return `${calcName}(${degenerateKeyword(node.value)})`;
  }
  if (node.type === 'Dim' && isDegenerate(node.value)) {
    return `${calcName}(${degenerateKeyword(node.value)} * 1${node.unit})`;
  }

  if (
    node.type === 'Num' ||
    node.type === 'Dim' ||
    node.type === 'Ident' ||
    node.type === 'Call'
  ) {
    return serializeExpr(node, prec);
  }

  // Single-term Sum is the canonical form for `-var(--x)` / `-(a*b)` —
  // sign=-1 around an opaque node. Signed leaves live in Num/Dim directly.
  if (node.type === 'Sum' && node.terms.length === 1) {
    return `${calcName}(${serializeLeadingNeg(node.terms[0].node, prec)})`;
  }

  return `${calcName}(${serializeExpr(node, prec)})`;
}

// --- Inside calc() expression --------------------------------------------

/**
 * @param {Node} node
 * @param {number | false} prec
 * @return {string}
 */
function serializeExpr(node, prec) {
  switch (node.type) {
    case 'Num':
      if (isDegenerate(node.value)) {return degenerateKeyword(node.value);}
      return String(round(node.value, prec));
    case 'Dim':
      if (isDegenerate(node.value)) {
        // Nested degenerate Dim wraps in calc() so the `<kw> * 1<unit>` form
        // parses back as one Dim factor. The bare form round-trips wrong
        // inside a Product — `0 * Dim(Infinity, px)` would re-fold as NaN.
        return `calc(${degenerateKeyword(node.value)} * 1${node.unit})`;
      }
      return `${round(node.value, prec)}${node.unit}`;
    case 'Ident':
      return node.name;
    case 'Call': {
      const args = node.args.map((a) => serializeExpr(a, prec)).join(', ');
      return `${node.name}(${args})`;
    }
    case 'Sum':
      return serializeSum(node, prec);
    case 'Product':
      return serializeProduct(node, prec);
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
  if (node.type === 'Num' && isFinite(node.value) && node.value < 0) {
    return {
      sign: /** @type {1 | -1} */ (-sign),
      magnitude: { type: 'Num', value: -node.value },
    };
  }
  if (node.type === 'Dim' && isFinite(node.value) && node.value < 0) {
    return {
      sign: /** @type {1 | -1} */ (-sign),
      magnitude: { type: 'Dim', value: -node.value, unit: node.unit },
    };
  }
  return { sign, magnitude: node };
}

/**
 * @param {Sum} sum
 * @param {number | false} prec
 * @return {string}
 */
function serializeSum(sum, prec) {
  let out = '';
  sum.terms.forEach((t, i) => {
    const { sign, magnitude } = displaySign(t);
    if (i === 0) {
      out = sign === 1
        ? serializeExpr(magnitude, prec)
        : serializeLeadingNeg(magnitude, prec);
    } else {
      // `-` binds looser than `*`/`/` so the right side never needs parens.
      const body = serializeExpr(magnitude, prec);
      out += sign === 1 ? ` + ${body}` : ` - ${body}`;
    }
  });
  return out;
}

/**
 * Fold a leading negation into a finite leading Num if there is one
 * (`-(0.5 * x)` → `-0.5 * x`); else use `-(…)` for Sum/Product or `-x`.
 * @param {Node} node
 * @param {number | false} prec
 * @return {string}
 */
function serializeLeadingNeg(node, prec) {
  if (
    node.type === 'Product' &&
    node.factors.length > 0 &&
    node.factors[0].exponent === 1 &&
    node.factors[0].node.type === 'Num' &&
    isFinite(node.factors[0].node.value) &&
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
        : [
            { exponent: 1, node: { type: 'Num', value: negatedValue } },
            ...rest,
          ];
    return serializeProduct({ type: 'Product', factors: negatedFactors }, prec);
  }
  const body = serializeExpr(node, prec);
  return node.type === 'Sum' || node.type === 'Product' ? `-(${body})` : `-${body}`;
}

/**
 * @param {Product} product
 * @param {number | false} prec
 * @return {string}
 */
function serializeProduct(product, prec) {
  let out = '';
  product.factors.forEach((f, i) => {
    let body = serializeExpr(f.node, prec);
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
  });
  return out;
}

// Stryker disable next-line all: instrumenting this line breaks Node's
// cjs-module-lexer named-export detection for .mjs `import { x } from` consumers.
module.exports = { serialize };
