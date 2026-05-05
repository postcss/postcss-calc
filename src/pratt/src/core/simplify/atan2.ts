// §10.4 — atan2. foldConstArgs already rejects percentages (property-
// context-resolved) and enforces shared base + static convertibility.

import type { Node } from '../node.ts';
import { num, dim } from '../node.ts';
import { foldConstArgs } from './fold.ts';

export function simplifyAtan2(args: Node[]): Node {
  if (args.length !== 2) return { type: 'Call', name: 'atan2', args };
  const fold = foldConstArgs(args);
  if (fold === null) return { type: 'Call', name: 'atan2', args };
  const [y, x] = fold.values as [number, number];
  const radians = Math.atan2(y, x);
  if (isNaN(radians)) return num(NaN);
  return dim((radians * 180) / Math.PI, 'deg');
}
