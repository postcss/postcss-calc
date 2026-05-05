import type { Node, Product } from '../node.ts';
import { mkSum, mkProduct, num, dim } from '../node.ts';
import type { SimplifyOptions, SimplifyFn } from './types.ts';
import { tryCancelPair } from './cancel.ts';

export function simplifyProduct(
  product: Product,
  options: SimplifyOptions,
  simplify: SimplifyFn
): Node {
  let coeff = 1;
  let coeffFirstIndex = -1;
  const dims: {
    exponent: 1 | -1;
    value: number;
    unit: string;
    originIndex: number;
  }[] = [];
  const opaque: { exponent: 1 | -1; node: Node; originIndex: number }[] = [];

  function processFactor(
    exponent: 1 | -1,
    n: Node,
    originIndex: number
  ): void {
    if (n.type === 'Product') {
      for (const inner of n.factors) {
        processFactor(
          (exponent * inner.exponent) as 1 | -1,
          inner.node,
          originIndex
        );
      }
      return;
    }
    if (n.type === 'Num') {
      if (exponent === 1) {
        coeff *= n.value;
      } else {
        coeff /= n.value; // §10.9.1: 1/0 → ±Infinity, 0/0 → NaN per IEEE-754
      }
      if (coeffFirstIndex < 0) coeffFirstIndex = originIndex;
      return;
    }
    if (n.type === 'Dim') {
      dims.push({ exponent, value: n.value, unit: n.unit, originIndex });
      return;
    }
    opaque.push({ exponent, node: n, originIndex });
  }

  let topIndex = 0;
  for (const f of product.factors) {
    processFactor(f.exponent, simplify(f.node, options), topIndex++);
  }

  // §10.2 typed division. Higher-power cancellation (`px^2 / px`) is left
  // unreduced — consumers don't rely on it and the spec doesn't require it.
  const cancelled = tryCancelPair(dims);
  if (cancelled !== null) {
    coeff *= cancelled.factor;
    if (coeffFirstIndex < 0) coeffFirstIndex = dims[0]!.originIndex;
  }
  const remainingDims = cancelled ? cancelled.remaining : dims;

  // §10.10 distributive multiplication: `0.5 * (100vw - 10px)` → `50vw - 5px`.
  // Only distribute when every Sum term is Num/Dim — partial distribution
  // over opaque terms matches neither v10 nor csstools.
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
        ]),
        options
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

  interface FactorSlot {
    factor: { exponent: 1 | -1; node: Node };
    originIndex: number;
  }
  const slots: FactorSlot[] = [];
  if (coeff !== 1) {
    // coeff !== 1 implies a Num was processed or tryCancelPair fired,
    // either of which sets coeffFirstIndex to a non-negative value.
    slots.push({
      factor: { exponent: 1, node: num(coeff) },
      originIndex: coeffFirstIndex,
    });
  }
  for (const d of remainingDims) {
    slots.push({
      factor: { exponent: d.exponent, node: dim(d.value, d.unit) },
      originIndex: d.originIndex,
    });
  }
  for (const o of opaque) {
    slots.push({
      factor: { exponent: o.exponent, node: o.node },
      originIndex: o.originIndex,
    });
  }
  if (options.preserveOrder) {
    slots.sort((a, b) => a.originIndex - b.originIndex);
  }

  return mkProduct(slots.map((s) => s.factor));
}
