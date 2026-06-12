// Folds @csstools/css-tokenizer output into the calc() token subset.

import { tokenize as tokenizeCss, TokenType as CssType } from '@csstools/css-tokenizer';

export type TokenType =
  | 'number'
  | 'dimension'
  | 'ident'
  | 'punct'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  /** Present on `dimension` tokens; `%` for percentages. */
  unit?: string;
  pos: number;
  /** Whitespace immediately before — drives the §10.1 `+`/`-` rule. */
  ws: boolean;
}

export interface TokenizeOptions {
  /** Force `ws` true on every token to accept legacy input like `2px+3px`. */
  lenientWhitespace?: boolean;
}

const PUNCT_DELIMS = new Set(['+', '-', '*', '/']);

const NUMERIC_RAW = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/;

export function tokenize(
  input: string,
  options: TokenizeOptions = {}
): Token[] {
  const lenient = options.lenientWhitespace === true;
  const tokens: Token[] = [];
  let ws = true;

  // CSS absorbs leading signs (`-5px` is one token); the parser expects
  // punct sign + unsigned numeric, so split them back out.
  function pushNumeric(
    raw: string,
    unit: string | undefined,
    pos: number
  ): void {
    let value = NUMERIC_RAW.exec(raw)![0];
    const sign = value[0];
    if (sign === '+' || sign === '-') {
      tokens.push({ type: 'punct', value: sign, pos, ws: lenient || ws });
      value = value.slice(1);
      pos += 1;
      ws = false;
    }
    if (unit === undefined) {
      tokens.push({ type: 'number', value, pos, ws: lenient || ws });
    } else {
      tokens.push({ type: 'dimension', value, unit, pos, ws: lenient || ws });
    }
    ws = false;
  }

  for (const t of tokenizeCss({ css: input })) {
    switch (t[0]) {
      case CssType.Whitespace:
      case CssType.Comment:
        ws = true;
        continue;
      case CssType.Number:
        pushNumeric(t[1], undefined, t[2]);
        continue;
      case CssType.Dimension:
        pushNumeric(t[1], t[4].unit, t[2]);
        continue;
      case CssType.Percentage:
        pushNumeric(t[1], '%', t[2]);
        continue;
      case CssType.Ident:
        tokens.push({ type: 'ident', value: t[4].value, pos: t[2], ws: lenient || ws });
        break;
      case CssType.Function:
        tokens.push({ type: 'ident', value: t[4].value, pos: t[2], ws: lenient || ws });
        tokens.push({ type: 'punct', value: '(', pos: t[2] + t[1].length - 1, ws: lenient });
        break;
      case CssType.OpenParen:
        tokens.push({ type: 'punct', value: '(', pos: t[2], ws: lenient || ws });
        break;
      case CssType.CloseParen:
        tokens.push({ type: 'punct', value: ')', pos: t[2], ws: lenient || ws });
        break;
      case CssType.Comma:
        tokens.push({ type: 'punct', value: ',', pos: t[2], ws: lenient || ws });
        break;
      case CssType.Delim:
        if (!PUNCT_DELIMS.has(t[4].value)) {
          throw new Error(
            `Unexpected character "${t[4].value}" at position ${t[2]}`
          );
        }
        tokens.push({ type: 'punct', value: t[4].value, pos: t[2], ws: lenient || ws });
        break;
      case CssType.EOF:
        tokens.push({ type: 'eof', value: '', pos: input.length, ws: lenient || ws });
        break;
      default:
        throw new Error(
          `Unexpected character "${t[1][0] ?? ''}" at position ${t[2]}`
        );
    }
    ws = false;
  }

  return tokens;
}
