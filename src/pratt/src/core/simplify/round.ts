import type { Node } from '../node.ts';
import { num, dim } from '../node.ts';
import { foldConstArgs } from './fold.ts';

const ROUND_STRATEGIES = new Set(['nearest', 'up', 'down', 'to-zero']);
type RoundStrategy = 'nearest' | 'up' | 'down' | 'to-zero';

export function simplifyRound(args: Node[]): Node {
  let strategy: RoundStrategy = 'nearest';
  let rest = args;
  const first = args[0];
  if (first?.type === 'Ident') {
    const n = first.name.toLowerCase();
    if (!ROUND_STRATEGIES.has(n)) {
      // Unrecognized strategy ident — opaque rather than guessing intent.
      return { type: 'Call', name: 'round', args };
    }
    strategy = n as RoundStrategy;
    rest = args.slice(1);
  }

  const passthrough = (): Node => ({
    type: 'Call',
    name: 'round',
    args:
      strategy === 'nearest'
        ? rest
        : [{ type: 'Ident', name: strategy }, ...rest],
  });

  // B omitted: defaults to 1 when A is <number>; else opaque.
  const argsForFold = argsForRoundFold(rest);
  const fold = argsForFold && foldConstArgs(argsForFold);
  if (!fold) return passthrough();

  const [a, b] = fold.values as [number, number];
  // Spec §10.7.1 non-finite step: NaN propagates; infinite step with
  // finite A folds to ±0 carrying A's sign (every strategy picks the same
  // single point); both infinite cancels to NaN. Infinite-A / finite-B
  // falls through to applyRound, where floor*b===ceil*b===±∞ collapses
  // back to A (§10.3.1 "result is the same infinity").
  if (isNaN(b)) return num(NaN);
  if (!isFinite(b)) {
    if (!isFinite(a)) return num(NaN);
    const signedZero = a < 0 || Object.is(a, -0) ? -0 : 0;
    return fold.unit === '' ? num(signedZero) : dim(signedZero, fold.unit);
  }

  const result = applyRound(strategy, a, b);
  if (isNaN(result)) return num(NaN);
  return fold.unit === '' ? num(result) : dim(result, fold.unit);
}

function argsForRoundFold(args: Node[]): Node[] | null {
  if (args.length === 2) return args;
  if (args.length === 1 && args[0]!.type === 'Num') {
    return [args[0]!, num(1)];
  }
  return null;
}

function applyRound(strategy: RoundStrategy, a: number, b: number): number {
  if (b === 0) return NaN;
  const q = a / b;
  const c1 = Math.floor(q) * b;
  const c2 = Math.ceil(q) * b;
  // With negative B, floor*B > ceil*B; spec defines lower as closer to -∞.
  const lower = Math.min(c1, c2);
  const upper = Math.max(c1, c2);
  if (lower === upper) return a;
  switch (strategy) {
    case 'up':
      return upper;
    case 'down':
      return lower;
    case 'to-zero':
      return Math.abs(lower) <= Math.abs(upper) ? lower : upper;
    case 'nearest': {
      const dl = a - lower;
      const du = upper - a;
      return du <= dl ? upper : lower; // tie → upper (§10.3 line 978)
    }
  }
}
