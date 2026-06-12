import type { Node, Sum, SumTerm } from '../node.ts';
import { mkSum, num, dim } from '../node.ts';
import { baseOf } from '../type.ts';
import type { SimplifyFn } from './types.ts';
import { type UnitBucket, mergeConvertibleBuckets } from './bucket.ts';

export function simplifySum(sum: Sum, simplify: SimplifyFn): Node {
  // §10.10 two-phase dim handling: phase 1 buckets by exact unit (`1em + 1em`
  // → `2em`); phase 2 merges convertible same-base buckets into the first-
  // encountered unit. `100vh - 5rem - 10rem - 100px` → `-15rem` in phase 1,
  // then vh/rem/px stay separate in phase 2 (none convert to each other).
  let numTotal = 0;
  const byUnit = new Map<string, UnitBucket>();
  const opaque: SumTerm[] = [];
  let bucketOrder = 0;

  function processTerm(sign: 1 | -1, n: Node): void {
    if (n.type === 'Sum') {
      for (const inner of n.terms) {
        processTerm((sign * inner.sign) as 1 | -1, inner.node);
      }
      return;
    }
    if (n.type === 'Num') {
      numTotal += sign * n.value;
      return;
    }
    if (n.type === 'Dim') {
      const key = n.unit.toLowerCase();
      const existing = byUnit.get(key);
      if (existing) {
        existing.total += sign * n.value;
      } else {
        byUnit.set(key, {
          unit: n.unit,
          total: sign * n.value,
          base: baseOf(n.unit),
          order: bucketOrder++,
        });
      }
      return;
    }
    opaque.push({ sign, node: n });
  }

  for (const t of sum.terms) {
    processTerm(t.sign, simplify(t.node));
  }

  // mkSum drops zero-valued Nums, so pushing the numeric total
  // unconditionally is harmless. Zero-valued unit buckets are kept for
  // type info (WPT calc-serialization-002).
  const terms: SumTerm[] = [{ sign: 1, node: num(numTotal) }];
  for (const bucket of mergeConvertibleBuckets([...byUnit.values()])) {
    terms.push({ sign: 1, node: dim(bucket.total, bucket.unit) });
  }
  terms.push(...opaque);

  return mkSum(terms);
}
