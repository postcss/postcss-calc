// Spec: https://www.w3.org/TR/css-values-4/#serialize-a-calculation-tree
// Outer calc() is added only when the top-level result contains an
// arithmetic operator. A Sum inside a Product is the only place parens
// are ever required on valid canonical input.

import type { Node, Sum, Product, ProductFactor } from './node.ts';

export interface SerializeOptions {
  /** Decimal places for numbers. `false` disables rounding. Default 5. */
  precision?: number | false;
  /** Wrapper name to use when `calc()` is needed. Default `'calc'`. */
  calcName?: string;
}

function round(v: number, prec: number | false): number {
  if (prec === false) {
    return v;
  }
  const m = Math.pow(10, prec);
  return Math.round(v * m) / m;
}

// §10.13 / §10.7.2: Infinity/NaN serialize as canonical keywords.
function isDegenerate(v: number): boolean {
  return !isFinite(v) || isNaN(v);
}

function degenerateKeyword(v: number): string {
  if (isNaN(v)) return 'NaN';
  return v > 0 ? 'infinity' : '-infinity';
}

export function serialize(node: Node, opts: SerializeOptions = {}): string {
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
    return `${calcName}(${serializeLeadingNeg(node.terms[0]!.node, prec)})`;
  }

  return `${calcName}(${serializeExpr(node, prec)})`;
}

// --- Inside calc() expression --------------------------------------------

function serializeExpr(node: Node, prec: number | false): string {
  switch (node.type) {
    case 'Num':
      if (isDegenerate(node.value)) return degenerateKeyword(node.value);
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

/** Combine the term's sign with a negative Num/Dim value's sign so
 *  `{sign:+1, Num(-5)}` renders as `-5`, not `+ -5`. */
function displaySign(
  term: { sign: 1 | -1; node: Node }
): { sign: 1 | -1; magnitude: Node } {
  const { sign, node } = term;
  if (node.type === 'Num' && node.value < 0) {
    return {
      sign: (-sign) as 1 | -1,
      magnitude: { type: 'Num', value: -node.value },
    };
  }
  if (node.type === 'Dim' && node.value < 0) {
    return {
      sign: (-sign) as 1 | -1,
      magnitude: { type: 'Dim', value: -node.value, unit: node.unit },
    };
  }
  return { sign, magnitude: node };
}

function serializeSum(sum: Sum, prec: number | false): string {
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

/** Fold a leading negation into a finite leading Num if there is one
 *  (`-(0.5 * x)` → `-0.5 * x`); else use `-(…)` for Sum/Product or `-x`. */
function serializeLeadingNeg(node: Node, prec: number | false): string {
  if (
    node.type === 'Product' &&
    node.factors.length > 0 &&
    node.factors[0]!.exponent === 1 &&
    node.factors[0]!.node.type === 'Num' &&
    isFinite(node.factors[0]!.node.value)
  ) {
    const head = node.factors[0]!.node;
    const negatedFactors: ProductFactor[] = [
      { exponent: 1, node: { type: 'Num', value: -head.value } },
      ...node.factors.slice(1),
    ];
    return serializeProduct({ type: 'Product', factors: negatedFactors }, prec);
  }
  const body = serializeExpr(node, prec);
  return node.type === 'Sum' || node.type === 'Product' ? `-(${body})` : `-${body}`;
}

function serializeProduct(product: Product, prec: number | false): string {
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
