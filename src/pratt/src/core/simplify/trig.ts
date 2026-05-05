// §10.4 — sin/cos/tan. <number> is radians; <angle> dim is converted.

import type { Node } from '../node.ts';
import { num } from '../node.ts';
import { baseOf, convert } from '../type.ts';

const TRIG_OPS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
} as const;

export function simplifyTrig(name: 'sin' | 'cos' | 'tan', args: Node[]): Node {
  if (args.length !== 1) return { type: 'Call', name, args };
  const a = args[0]!;
  let radians: number | null = null;
  if (a.type === 'Num') {
    radians = a.value;
  } else if (a.type === 'Dim' && a.unit !== '%' && baseOf(a.unit) === 'angle') {
    // The `baseOf === 'angle'` check and the `inDeg !== null` guard below
    // are observationally equivalent under current type tables (every
    // angle unit has a TO_CANONICAL entry). Stryker flags both as
    // equivalent-mutant survivors — keep them; they're load-bearing
    // defense against future unit additions.
    const inDeg = convert(a.value, a.unit, 'deg');
    if (inDeg !== null) radians = (inDeg * Math.PI) / 180;
  }
  if (radians === null) return { type: 'Call', name, args };
  return num(TRIG_OPS[name](radians));
}
