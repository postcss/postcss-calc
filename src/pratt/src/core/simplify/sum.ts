import type { Node, Sum, SumTerm } from '../node.ts';
import { mkSum, num, dim } from '../node.ts';
import { baseOf } from '../type.ts';
import type { SimplifyOptions, SimplifyFn } from './types.ts';
import { type UnitBucket, mergeConvertibleBuckets } from './bucket.ts';

export function simplifySum(
  sum: Sum,
  options: SimplifyOptions,
  simplify: SimplifyFn
): Node {
  // §10.10 two-phase dim handling: phase 1 buckets by exact unit (`1em + 1em`
  // → `2em`); phase 2 merges convertible same-base buckets into the first-
  // encountered unit. `100vh - 5rem - 10rem - 100px` → `-15rem` in phase 1,
  // then vh/rem/px stay separate in phase 2 (none convert to each other).
  let numTotal = 0;
  // origin tracks the input position of the first contributing term per
  // output slot — used by `preserveOrder` to merge-sort by input order.
  let numFirstIndex = -1;
  const byUnit = new Map<string, UnitBucket>();
  const opaque: { sign: 1 | -1; node: Node; originIndex: number }[] = [];
  let bucketOrder = 0;

  function processTerm(sign: 1 | -1, n: Node, originIndex: number): void {
    if (n.type === 'Sum') {
      for (const inner of n.terms) {
        processTerm((sign * inner.sign) as 1 | -1, inner.node, originIndex);
      }
      return;
    }
    if (n.type === 'Num') {
      numTotal += sign * n.value;
      if (numFirstIndex < 0) numFirstIndex = originIndex;
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
          originIndex,
        });
      }
      return;
    }
    opaque.push({ sign, node: n, originIndex });
  }

  let topIndex = 0;
  for (const t of sum.terms) {
    processTerm(t.sign, simplify(t.node, options), topIndex++);
  }

  const finalBuckets = mergeConvertibleBuckets([...byUnit.values()]);

  // dropZeroIdentities drops a zero-valued bucket only when another term
  // already carries type info (numTotal, another bucket, or an opaque).
  const hasOtherSignal =
    numTotal !== 0 ||
    finalBuckets.some((b) => b.total !== 0) ||
    opaque.length > 0;

  interface OutputSlot {
    term: SumTerm;
    originIndex: number;
  }
  const slots: OutputSlot[] = [];
  // mkSum drops zero-valued Nums, so an "empty" numeric slot with
  // numFirstIndex === -1 is harmless; pushing unconditionally is simpler.
  slots.push({
    term: { sign: 1, node: num(numTotal) },
    originIndex: numFirstIndex,
  });
  for (const bucket of finalBuckets) {
    // Default: emit `0<unit>` for type info (WPT calc-serialization-002).
    // dropZeroIdentities flips to the legacy "drop zero terms when typed
    // siblings survive" behavior.
    if (
      options.dropZeroIdentities &&
      bucket.total === 0 &&
      hasOtherSignal
    ) {
      continue;
    }
    slots.push({
      term: { sign: 1, node: dim(bucket.total, bucket.unit) },
      originIndex: bucket.originIndex,
    });
  }
  for (const o of opaque) {
    slots.push({
      term: { sign: o.sign, node: o.node },
      originIndex: o.originIndex,
    });
  }

  if (options.preserveOrder) {
    slots.sort((a, b) => a.originIndex - b.originIndex);
  }

  return mkSum(slots.map((s) => s.term));
}
