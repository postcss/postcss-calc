import type { Node } from '../node.ts';
import { num, dim } from '../node.ts';
import { foldConstArgs } from './fold.ts';

export function simplifyClamp(args: Node[]): Node {
  if (args.length === 3) {
    const fold = foldConstArgs(args);
    if (fold !== null) {
      const [lo, v, hi] = fold.values as [number, number, number];
      // Spec §10.8: clamp(MIN, VAL, MAX) = max(MIN, min(VAL, MAX)). The
      // outer max(MIN, …) means MIN wins when MIN > MAX — not MAX.
      const clamped = Math.max(lo, Math.min(v, hi));
      return fold.unit === '' ? num(clamped) : dim(clamped, fold.unit);
    }
  }
  return { type: 'Call', name: 'clamp', args };
}
