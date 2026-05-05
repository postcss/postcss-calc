import type { Node } from '../node.ts';
import { num, dim } from '../node.ts';
import { foldConstArgs } from './fold.ts';

export function simplifyModRem(name: 'mod' | 'rem', args: Node[]): Node {
  if (args.length !== 2) return { type: 'Call', name, args };
  const fold = foldConstArgs(args);
  if (fold === null) return { type: 'Call', name, args };
  const [a, b] = fold.values as [number, number];
  const result = applyModRem(name, a, b);
  // NaN results drop the unit (`mod(5px, 0px)` → `calc(NaN)`, not
  // `calc(NaN * 1px)`). §10.12 unit-preserving form is a known divergence.
  if (isNaN(result)) return num(NaN);
  return fold.unit === '' ? num(result) : dim(result, fold.unit);
}

function applyModRem(name: 'mod' | 'rem', a: number, b: number): number {
  if (b === 0) return NaN;
  if (!isFinite(a)) return NaN;
  if (!isFinite(b)) {
    // mod: result is NaN when A has opposite sign to B; otherwise A.
    // rem: result is A regardless of signs.
    if (name === 'mod' && a !== 0 && Math.sign(a) !== Math.sign(b)) return NaN;
    return a;
  }
  return name === 'mod'
    ? a - b * Math.floor(a / b) // sign follows divisor
    : a - b * Math.trunc(a / b); // sign follows dividend (≡ JS %)
}
