import type { Node } from '../node.ts';
import { num } from '../node.ts';

export function simplifySign(args: Node[]): Node {
  if (args.length !== 1) {
    return { type: 'Call', name: 'sign', args };
  }
  const a = args[0]!;
  if (a.type === 'Num') return num(Math.sign(a.value));
  // %: sign is property-context-dependent (§10.6) — opaque.
  if (a.type === 'Dim' && a.unit !== '%') return num(Math.sign(a.value));
  return { type: 'Call', name: 'sign', args: [a] };
}
