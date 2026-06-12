import type { Node, Product, ProductFactor } from '../node.ts';
import { mkSum, mkProduct, num, dim } from '../node.ts';
import type { SimplifyFn } from './types.ts';
import { tryCancelPair } from './cancel.ts';

export function simplifyProduct(product: Product, simplify: SimplifyFn): Node {
  let coeff = 1;
  const dims: { exponent: 1 | -1; value: number; unit: string }[] = [];
  const opaque: ProductFactor[] = [];

  function processFactor(exponent: 1 | -1, n: Node): void {
    if (n.type === 'Product') {
      for (const inner of n.factors) {
        processFactor((exponent * inner.exponent) as 1 | -1, inner.node);
      }
      return;
    }
    if (n.type === 'Num') {
      if (exponent === 1) {
        coeff *= n.value;
      } else {
        coeff /= n.value; // §10.9.1: 1/0 → ±Infinity, 0/0 → NaN per IEEE-754
      }
      return;
    }
    if (n.type === 'Dim') {
      dims.push({ exponent, value: n.value, unit: n.unit });
      return;
    }
    opaque.push({ exponent, node: n });
  }

  for (const f of product.factors) {
    processFactor(f.exponent, simplify(f.node));
  }

  // §10.2 typed division. Higher-power cancellation (`px^2 / px`) is left
  // unreduced — consumers don't rely on it and the spec doesn't require it.
  const cancelled = tryCancelPair(dims);
  if (cancelled !== null) {
    coeff *= cancelled.factor;
  }
  const remainingDims = cancelled ? cancelled.remaining : dims;

  // §10.10 distributive multiplication: `0.5 * (100vw - 10px)` → `50vw - 5px`.
  // Only distribute when every Sum term is Num/Dim — partial distribution
  // over opaque terms matches neither the legacy implementation nor csstools.
  if (
    remainingDims.length === 0 &&
    opaque.length === 1 &&
    opaque[0]!.exponent === 1 &&
    opaque[0]!.node.type === 'Sum' &&
    opaque[0]!.node.terms.every(
      (t) => t.node.type === 'Num' || t.node.type === 'Dim'
    )
  ) {
    const sum = opaque[0]!.node;
    const distributed = sum.terms.map((t) => ({
      sign: t.sign,
      node: simplify(
        mkProduct([
          { exponent: 1, node: num(coeff) },
          { exponent: 1, node: t.node },
        ])
      ),
    }));
    return mkSum(distributed);
  }

  if (
    remainingDims.length === 1 &&
    remainingDims[0]!.exponent === 1 &&
    opaque.length === 0
  ) {
    const d = remainingDims[0]!;
    return dim(coeff * d.value, d.unit);
  }

  if (remainingDims.length === 0 && opaque.length === 0) {
    return num(coeff);
  }

  const factors: ProductFactor[] = [];
  if (coeff !== 1) {
    factors.push({ exponent: 1, node: num(coeff) });
  }
  for (const d of remainingDims) {
    factors.push({ exponent: d.exponent, node: dim(d.value, d.unit) });
  }
  factors.push(...opaque);

  return mkProduct(factors);
}
