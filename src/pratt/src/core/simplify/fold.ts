// Fold args to a common numeric representation if they share a type.
// Percentages never fold — ordering depends on property-context
// resolution we don't have. Matches csstools.

import type { Node } from '../node.ts';
import { baseOf, convert, type BaseType } from '../type.ts';

export function foldConstArgs(
  args: Node[]
): { values: number[]; unit: string } | null {
  if (args.length === 0) return null;

  const first = args[0]!;
  if (first.type === 'Num') {
    return foldNumberArgs(args);
  }
  if (first.type === 'Dim') {
    const b = first.unit === '%' ? null : baseOf(first.unit);
    if (!b) return null;
    return foldDimArgs(args, first.unit, b);
  }
  return null;
}

function foldNumberArgs(args: Node[]): { values: number[]; unit: '' } | null {
  const values: number[] = [];
  for (const a of args) {
    if (a.type !== 'Num') return null;
    values.push(a.value);
  }
  return { values, unit: '' };
}

function foldDimArgs(
  args: Node[],
  unit: string,
  base: BaseType
): { values: number[]; unit: string } | null {
  const values: number[] = [];
  for (const a of args) {
    if (a.type !== 'Dim' || a.unit === '%' || baseOf(a.unit) !== base) {
      return null;
    }
    const converted = convert(a.value, a.unit, unit);
    if (converted === null) return null;
    values.push(converted);
  }
  return { values, unit };
}
