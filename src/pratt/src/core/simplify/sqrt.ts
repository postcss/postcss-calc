import type { Node } from '../node.ts';
import { num } from '../node.ts';

export function simplifySqrt(args: Node[]): Node {
  if (args.length !== 1 || args[0]!.type !== 'Num') {
    return { type: 'Call', name: 'sqrt', args };
  }
  return num(Math.sqrt(args[0]!.value));
}
