import type { Node } from '../node.ts';
import { num, dim } from '../node.ts';

export function simplifyAbs(args: Node[]): Node {
  if (args.length !== 1) {
    return { type: 'Call', name: 'abs', args };
  }
  const a = args[0]!;
  if (a.type === 'Num') return num(Math.abs(a.value));
  if (a.type === 'Dim' && a.unit !== '%') return dim(Math.abs(a.value), a.unit);
  return { type: 'Call', name: 'abs', args: [a] };
}
