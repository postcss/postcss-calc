// §10.4 — asin/acos/atan. Bare <number> in, <angle> in degrees out.

import type { Node } from '../node.ts';
import { num, dim } from '../node.ts';

const INVERSE_TRIG_OPS = {
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
} as const;

export function simplifyInverseTrig(
  name: 'asin' | 'acos' | 'atan',
  args: Node[]
): Node {
  if (args.length !== 1) return { type: 'Call', name, args };
  const a = args[0]!;
  if (a.type !== 'Num') return { type: 'Call', name, args };
  const radians = INVERSE_TRIG_OPS[name](a.value);
  if (isNaN(radians)) return num(NaN);
  return dim((radians * 180) / Math.PI, 'deg');
}
