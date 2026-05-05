import type { Node } from '../node.ts';
import { num } from '../node.ts';

export function simplifyLog(args: Node[]): Node {
  if (args.length === 1 && args[0]!.type === 'Num') {
    return num(Math.log(args[0]!.value));
  }
  if (
    args.length === 2 &&
    args[0]!.type === 'Num' &&
    args[1]!.type === 'Num'
  ) {
    return num(Math.log(args[0]!.value) / Math.log(args[1]!.value));
  }
  return { type: 'Call', name: 'log', args };
}
