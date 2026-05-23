// Spec: https://www.w3.org/TR/css-values-4/#calc-syntax
// Subset of CSS tokenization for calc(): numbers, dimensions (incl. the
// `1px-2` single-token rule), identifiers (with `-`), and punctuation.

export type TokenType =
  | 'number'
  | 'dimension'
  | 'ident'
  | 'punct'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  /** Present on `dimension` tokens; includes `%` for percentages. */
  unit?: string;
  pos: number;
  /**
   * True if at least one whitespace character appeared immediately before
   * this token. Used by the parser to enforce §10.1's "`+` and `-` must be
   * surrounded by whitespace" rule.
   */
  ws: boolean;
}

const IS_DIGIT = /\d/;
// CSS Syntax L3 §4.2: name-start code points include any non-ASCII code
// point (≥ U+0080), so identifiers like `--φ` or `--πρωτο` are valid.
const IS_IDENT_START = /[a-zA-Z_\u0080-\uFFFF]/;
const IS_IDENT_BODY = /[\w\u0080-\uFFFF-]/;
const IS_WS = /\s/;
const PUNCT = new Set(['+', '-', '*', '/', '(', ')', ',']);

function readNumberStr(input: string, start: number): number {
  let i = start;
  while (i < input.length && IS_DIGIT.test(input[i]!)) {
    i++;
  }
  if (input[i] === '.') {
    i++;
    while (i < input.length && IS_DIGIT.test(input[i]!)) {
      i++;
    }
  }
  // Exponent only if followed by a digit (optionally after +/-) — keeps
  // `2em` as one dimension instead of `2e` plus unit `m`.
  if (input[i] === 'e' || input[i] === 'E') {
    const after = input[i + 1] ?? '';
    const hasExp =
      IS_DIGIT.test(after) ||
      ((after === '+' || after === '-') &&
        IS_DIGIT.test(input[i + 2] ?? ''));
    if (hasExp) {
      i++;
      if (input[i] === '+' || input[i] === '-') {
        i++;
      }
      while (i < input.length && IS_DIGIT.test(input[i]!)) {
        i++;
      }
    }
  }
  return i;
}

function readIdentBody(input: string, start: number): number {
  let i = start;
  while (i < input.length && IS_IDENT_BODY.test(input[i]!)) {
    i++;
  }
  return i;
}

/** Trailing `%` or ident body becomes the unit. CSS rule absorbs `-` and
 *  digits into the unit, so `1px-2` is one dimension with unit `px-2`. */
function pushNumericToken(
  input: string,
  start: number,
  push: (t: Omit<Token, 'ws'>) => void
): number {
  let i = readNumberStr(input, start);
  const numValue = input.slice(start, i);

  if (input[i] === '%') {
    push({ type: 'dimension', value: numValue, unit: '%', pos: start });
    return i + 1;
  }
  if (i < input.length && IS_IDENT_START.test(input[i]!)) {
    const unitStart = i;
    i = readIdentBody(input, i);
    push({
      type: 'dimension',
      value: numValue,
      unit: input.slice(unitStart, i),
      pos: start,
    });
    return i;
  }
  push({ type: 'number', value: numValue, pos: start });
  return i;
}

export interface TokenizeOptions {
  /**
   * When true, force every token's `ws` flag to true, defeating the
   * parser's §10.1 "`+` / `-` must be surrounded by whitespace" check.
   * Use this to accept legacy non-spec inputs like `2px+3px`. Default
   * false (strict, spec-aligned).
   */
  lenientWhitespace?: boolean;
}

export function tokenize(
  input: string,
  options: TokenizeOptions = {}
): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  // Start-of-input counts as whitespace; first token is always handled
  // by a prefix parselet anyway, not an infix operator.
  let ws = true;

  function push(t: Omit<Token, 'ws'>): void {
    tokens.push({ ...t, ws: options.lenientWhitespace ? true : ws });
    ws = false;
  }

  while (i < input.length) {
    const c = input[i]!;

    if (IS_WS.test(c)) {
      ws = true;
      i++;
      continue;
    }

    // CSS comment per Syntax L3 — treated as whitespace.
    if (c === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      if (end === -1) {
        throw new Error(`Unterminated /* comment at position ${i}`);
      }
      i = end + 2;
      ws = true;
      continue;
    }

    if (IS_DIGIT.test(c) || (c === '.' && IS_DIGIT.test(input[i + 1] ?? ''))) {
      i = pushNumericToken(input, i, push);
      continue;
    }

    if (IS_IDENT_START.test(c)) {
      const start = i;
      i = readIdentBody(input, i);
      push({ type: 'ident', value: input.slice(start, i), pos: start });
      continue;
    }

    // CSS Syntax L3: `-` followed by `-` or by an ident-start code point
    // begins an <ident-token>. Catches both custom properties (`--name`,
    // keeping `var(--x)` as one ident) and vendor-prefixed idents
    // (`-webkit-calc`, `-moz-calc`).
    if (
      c === '-' &&
      (input[i + 1] === '-' || IS_IDENT_START.test(input[i + 1] ?? ''))
    ) {
      const start = i;
      i++;
      i = readIdentBody(input, i);
      push({ type: 'ident', value: input.slice(start, i), pos: start });
      continue;
    }

    if (PUNCT.has(c)) {
      push({ type: 'punct', value: c, pos: i });
      i++;
      continue;
    }

    throw new Error(`Unexpected character "${c}" at position ${i}`);
  }

  push({ type: 'eof', value: '', pos: input.length });
  return tokens;
}
