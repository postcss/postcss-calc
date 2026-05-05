// Canonical AST. N-ary Sum and Product with signed numeric leaves.
// Invariants enforced by the constructors below:
//
//   - Num/Dim values may be any finite number (negatives allowed); a `-5`
//     is `Num(-5)`, never `Sum([{sign:-1, Num(5)}])`. One form per value.
//   - In a SumTerm with Num/Dim node, sign is always +1; the sign slot is
//     reserved for opaque nodes (Ident, Call, Product, multi-term Sum).
//   - No Sum directly contains another Sum (flattened on construction).
//   - No Product directly contains another Product (flattened).
//   - A Sum/Product with one positive element collapses to that element.
//   - A Sum/Product with no elements collapses to Num(0) / Num(1).
//   - Zero-valued Nums are dropped from sums (they contribute nothing).
//     Zero-valued Dims are kept — the unit carries type info.

export interface Num {
  type: 'Num';
  value: number;
}

export interface Dim {
  type: 'Dim';
  value: number;
  unit: string;
}

export interface Ident {
  type: 'Ident';
  name: string;
}

export interface Call {
  type: 'Call';
  name: string;
  args: Node[];
}

/** Sign is always +1 when node is Num or Dim. */
export interface SumTerm {
  sign: 1 | -1;
  node: Node;
}

export interface Sum {
  type: 'Sum';
  terms: SumTerm[];
}

/** exponent +1 = numerator, -1 = denominator. */
export interface ProductFactor {
  exponent: 1 | -1;
  node: Node;
}

export interface Product {
  type: 'Product';
  factors: ProductFactor[];
}

export type Node = Num | Dim | Ident | Call | Sum | Product;

export function num(value: number): Num {
  return { type: 'Num', value };
}

export function dim(value: number, unit: string): Dim {
  return { type: 'Dim', value, unit };
}

export function ident(name: string): Ident {
  return { type: 'Ident', name };
}

export function call(name: string, args: Node[]): Call {
  return { type: 'Call', name, args };
}

export function mkSum(rawTerms: SumTerm[]): Node {
  const flat: SumTerm[] = [];
  for (const t of rawTerms) {
    pushSumTerm(flat, t);
  }
  if (flat.length === 0) {
    return { type: 'Num', value: 0 };
  }
  if (flat.length === 1 && flat[0]!.sign === 1) {
    return flat[0]!.node;
  }
  return { type: 'Sum', terms: flat };
}

function pushSumTerm(out: SumTerm[], term: SumTerm): void {
  let { sign, node } = term;

  if (node.type === 'Sum') {
    for (const inner of node.terms) {
      pushSumTerm(out, {
        sign: (sign * inner.sign) as 1 | -1,
        node: inner.node,
      });
    }
    return;
  }

  // sign=-1 around a Num/Dim leaf collapses into the value's sign — the
  // canonical-form rule downstream code relies on.
  if (sign === -1) {
    if (node.type === 'Num') {
      node = { type: 'Num', value: -node.value };
      sign = 1;
    } else if (node.type === 'Dim') {
      node = { type: 'Dim', value: -node.value, unit: node.unit };
      sign = 1;
    }
  }

  // Drop zero-valued Nums. Dims with value 0 stay — the unit carries type.
  if (node.type === 'Num' && node.value === 0) {
    return;
  }

  out.push({ sign, node });
}

export function mkProduct(rawFactors: ProductFactor[]): Node {
  const flat: ProductFactor[] = [];
  for (const f of rawFactors) {
    pushProductFactor(flat, f);
  }
  if (flat.length === 0) {
    return { type: 'Num', value: 1 };
  }
  if (flat.length === 1 && flat[0]!.exponent === 1) {
    return flat[0]!.node;
  }
  return { type: 'Product', factors: flat };
}

function pushProductFactor(out: ProductFactor[], f: ProductFactor): void {
  const n = f.node;
  if (n.type === 'Product') {
    for (const inner of n.factors) {
      out.push({
        exponent: (f.exponent * inner.exponent) as 1 | -1,
        node: inner.node,
      });
    }
    return;
  }
  // Factor of 1 contributes nothing regardless of exponent (1/1 = 1).
  if (n.type === 'Num' && n.value === 1) {
    return;
  }
  out.push(f);
}

/** Negate any node, preserving canonical form. */
export function negate(node: Node): Node {
  if (node.type === 'Num') {
    return num(-node.value);
  }
  if (node.type === 'Dim') {
    return dim(-node.value, node.unit);
  }
  if (node.type === 'Sum') {
    return mkSum(
      node.terms.map((t) => ({ sign: (-t.sign) as 1 | -1, node: t.node }))
    );
  }
  // Opaque (Ident, Call, Product): wrap as a single negative-sign term —
  // the only case where sign=-1 remains on a SumTerm.
  return { type: 'Sum', terms: [{ sign: -1, node }] };
}
