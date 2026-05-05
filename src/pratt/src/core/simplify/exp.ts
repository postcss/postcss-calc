import type { Node } from '../node.ts';
import { num } from '../node.ts';

export function simplifyExp(args: Node[]): Node {
  if (args.length !== 1 || args[0]!.type !== 'Num') {
    return { type: 'Call', name: 'exp', args };
  }
  return num(Math.exp(args[0]!.value));
}
