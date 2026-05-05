// §10.5 — hypot. Empty args return null from foldConstArgs naturally.

import type { Node } from '../node.ts';
import { num, dim } from '../node.ts';
import { foldConstArgs } from './fold.ts';

export function simplifyHypot(args: Node[]): Node {
  const fold = foldConstArgs(args);
  if (fold === null) return { type: 'Call', name: 'hypot', args };
  const sumSq = fold.values.reduce((acc, v) => acc + v * v, 0);
  const result = Math.sqrt(sumSq);
  return fold.unit === '' ? num(result) : dim(result, fold.unit);
}
