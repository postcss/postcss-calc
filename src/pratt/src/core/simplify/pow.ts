// §10.5 — pow is <number>-only.

import type { Node } from '../node.ts';
import { num } from '../node.ts';

export function simplifyPow(args: Node[]): Node {
  if (args.length !== 2 || args[0]!.type !== 'Num' || args[1]!.type !== 'Num') {
    return { type: 'Call', name: 'pow', args };
  }
  return num(Math.pow(args[0]!.value, args[1]!.value));
}
