import type { Node } from '../node.ts';
import { num, dim } from '../node.ts';
import { foldConstArgs } from './fold.ts';

export function simplifyMinMax(name: string, args: Node[]): Node {
  const fold = foldConstArgs(args);
  if (fold !== null) {
    const fn = name.toLowerCase() === 'min' ? Math.min : Math.max;
    const value = fn(...fold.values);
    return fold.unit === '' ? num(value) : dim(value, fold.unit);
  }
  return { type: 'Call', name, args };
}
