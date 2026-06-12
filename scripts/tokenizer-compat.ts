// Projects our tokens and csstools-format tokens (library tuples or the
// @rmenke/css-tokenizer-tests JSON) onto one shape and diffs the streams.
// Compares decoded values, normalizing the two designed differences:
// function-token ≡ ident + `(`, and signed numeric ≡ punct sign + numeric.

import { tokenize as ourTokenize } from '../src/lib/tokenizer.js';
import type { Token as OurToken } from '../src/lib/tokenizer.js';

export interface SimpleToken {
  type: 'number' | 'dimension' | 'ident' | 'punct';
  name?: string;
  num?: number;
  unit?: string;
  /** Diagnostics only, never compared. */
  raw: string;
  ws: boolean;
}

export interface RawToken {
  type: string;
  raw: string;
  structured?: { value?: number | string; unit?: string } | null;
}

const PUNCT_DELIMS = new Set(['+', '-', '*', '/']);

export class OutOfSubsetError extends Error {
  constructor(public readonly tokenType: string, public readonly raw: string) {
    super(`out of subset: ${tokenType} ${JSON.stringify(raw)}`);
  }
}

export function fromCsstools(tokens: ReadonlyArray<RawToken>): SimpleToken[] {
  const out: SimpleToken[] = [];
  let ws = true;
  const push = (t: Omit<SimpleToken, 'ws'>): void => {
    out.push({ ...t, ws });
    ws = false;
  };

  for (const t of tokens) {
    switch (t.type) {
      case 'whitespace-token':
      case 'comment':
        ws = true;
        break;
      case 'EOF-token':
        break;
      case 'number-token':
        push({ type: 'number', num: t.structured?.value as number, raw: t.raw });
        break;
      case 'dimension-token':
        push({
          type: 'dimension',
          num: t.structured?.value as number,
          unit: t.structured?.unit,
          raw: t.raw,
        });
        break;
      case 'percentage-token':
        push({
          type: 'dimension',
          num: t.structured?.value as number,
          unit: '%',
          raw: t.raw,
        });
        break;
      case 'ident-token':
        push({ type: 'ident', name: t.structured?.value as string, raw: t.raw });
        break;
      case 'function-token':
        push({ type: 'ident', name: t.structured?.value as string, raw: t.raw });
        push({ type: 'punct', name: '(', raw: '(' });
        break;
      case '(-token':
        push({ type: 'punct', name: '(', raw: t.raw });
        break;
      case ')-token':
        push({ type: 'punct', name: ')', raw: t.raw });
        break;
      case 'comma-token':
        push({ type: 'punct', name: ',', raw: t.raw });
        break;
      case 'delim-token': {
        const ch = t.structured?.value as string;
        if (!PUNCT_DELIMS.has(ch)) throw new OutOfSubsetError(t.type, t.raw);
        push({ type: 'punct', name: ch, raw: t.raw });
        break;
      }
      default:
        throw new OutOfSubsetError(t.type, t.raw);
    }
  }
  return out;
}

export function fromOurs(tokens: ReadonlyArray<OurToken>): SimpleToken[] {
  const out: SimpleToken[] = [];
  for (const t of tokens) {
    if (t.type === 'eof') continue;
    if (t.type === 'number' || t.type === 'dimension') {
      out.push({
        type: t.type,
        num: parseFloat(t.value),
        unit: t.unit,
        raw: `${t.value}${t.unit ?? ''}`,
        ws: t.ws,
      });
    } else {
      out.push({ type: t.type, name: t.value, raw: t.value, ws: t.ws });
    }
  }
  return out;
}

export function tokenizeOursSimple(css: string): SimpleToken[] {
  return fromOurs(ourTokenize(css));
}

export interface Mismatch {
  index: number;
  ours: SimpleToken | null;
  theirs: SimpleToken | null;
}

const isNumeric = (t: SimpleToken): boolean =>
  t.type === 'number' || t.type === 'dimension';

const tokenEq = (a: SimpleToken, b: SimpleToken): boolean =>
  a.type === b.type &&
  a.ws === b.ws &&
  a.name === b.name &&
  a.num === b.num &&
  a.unit === b.unit;

export function compareStreams(
  ours: SimpleToken[],
  theirs: SimpleToken[]
): Mismatch | null {
  let i = 0;
  let j = 0;
  while (i < ours.length || j < theirs.length) {
    const a = ours[i] ?? null;
    const b = theirs[j] ?? null;
    if (!a || !b) return { index: j, ours: a, theirs: b };

    const next = ours[i + 1];
    if (
      a.type === 'punct' &&
      (a.name === '+' || a.name === '-') &&
      next !== undefined &&
      isNumeric(next) &&
      !next.ws &&
      isNumeric(b) &&
      b.ws === a.ws &&
      b.unit === next.unit &&
      b.num === (a.name === '-' ? -next.num! : next.num)
    ) {
      i += 2;
      j += 1;
      continue;
    }

    if (!tokenEq(a, b)) return { index: j, ours: a, theirs: b };
    i++;
    j++;
  }
  return null;
}
