// Token scanning and cursor navigation for the Pratt parser.
import { TokenType as CssType } from '@csstools/css-tokenizer';
import { CSS_NUMBER_PREFIX } from '../regex.js';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {ReturnType<typeof import('../block-index.js').indexBlocks>} BlockIndex */
/** @typedef {{raw: string, pos: number, ws: boolean, index: number}} TokenBase */
/** @typedef {TokenBase & {type: 'number', value: number, signCharacter?: '+' | '-'}} NumberToken */
/** @typedef {TokenBase & {type: 'dimension', value: number, unit: string, rawUnit: string, signCharacter?: '+' | '-'}} DimensionToken */
/** @typedef {TokenBase & {type: 'ident', value: string}} IdentToken */
/** @typedef {TokenBase & {type: 'function', value: string}} FunctionToken */
/** @typedef {'(' | ')' | ',' | '+' | '-' | '*' | '/'} Punctuator */
/** @typedef {TokenBase & {type: 'punct', value: Punctuator}} PunctToken */
/** @typedef {TokenBase & {type: 'eof', value: '', raw: ''}} EofToken */
/** @typedef {NumberToken | DimensionToken | IdentToken | FunctionToken | PunctToken | EofToken} Token */
/**
 * Immutable bounds and shared block index for one parse range.
 * @typedef {Readonly<{tokens: CSSToken[], end: number, index: BlockIndex}>} ParseInput
 */

/** @param {string} value @return {value is '+' | '-' | '*' | '/'} */
function isOperator(value) {
  return value === '+' || value === '-' || value === '*' || value === '/';
}

/** @param {string} raw @param {string} decoded */
function sourceSpelling(raw, decoded) {
  return raw === decoded ? undefined : raw;
}

/**
 * Mutable navigation state only. `index` is always the next native token
 * position; trivia is intentionally left visible to `scanToken`.
 */
class Cursor {
  /** @param {number} start */
  constructor(start) {
    /** @type {number} */
    this.index = start;
    /** @type {boolean} */
    this.firstToken = true;
    /** @type {Token | null} */
    this.lookahead = null;
    /** @type {number} */
    this.lookaheadNextIndex = start;
  }

  /** @param {number} index @return {void} */
  skipTo(index) {
    this.index = index;
    this.lookaheadNextIndex = index;
    this.firstToken = false;
    this.lookahead = null;
  }
}

/**
 * Scan one token without consuming it. `firstToken` supplies the virtual
 * leading trivia at a bounded parse boundary; all later whitespace state is
 * derived from the native tokens encountered in this scan.
 *
 * @param {ParseInput} input
 * @param {Cursor} cursor
 * @return {Token}
 */
function scanToken(input, cursor) {
  let i = cursor.index;
  let ws = cursor.firstToken;
  while (i < input.end) {
    const native = input.tokens[i];
    if (native[0] === CssType.Whitespace || native[0] === CssType.Comment) {
      ws = true;
      i++;
      continue;
    }
    if (native[0] === CssType.EOF) break;
    const token = normalizeToken(native, i, ws);
    cursor.lookahead = token;
    cursor.lookaheadNextIndex = i + 1;
    return token;
  }
  /** @type {EofToken} */
  const token = {
    type: 'eof',
    value: '',
    raw: '',
    pos: eofPositionAt(input, i),
    ws,
    index: i,
  };
  cursor.lookahead = token;
  // Native EOF is a real token and is consumed past its array index. When
  // the bounded range ends before native EOF, this is a virtual EOF and must
  // remain at the range boundary.
  cursor.lookaheadNextIndex =
    i < input.end && input.tokens[i][0] === CssType.EOF ? i + 1 : input.end;
  return token;
}

/** @param {CSSToken} t @param {number} index @param {boolean} ws @return {Token} */
function normalizeToken(t, index, ws) {
  const [type, raw, pos, , detail] = t;
  switch (type) {
    case CssType.Number:
      return {
        type: 'number',
        value: detail.value,
        raw,
        pos,
        ws,
        index,
        signCharacter: detail.signCharacter,
      };
    case CssType.Dimension: {
      const match = CSS_NUMBER_PREFIX.exec(raw);
      return {
        type: 'dimension',
        value: detail.value,
        raw,
        pos,
        ws,
        index,
        unit: detail.unit,
        rawUnit: match ? raw.slice(match[0].length) : detail.unit,
        signCharacter: detail.signCharacter,
      };
    }
    case CssType.Percentage:
      return {
        type: 'dimension',
        value: detail.value,
        raw,
        pos,
        ws,
        index,
        unit: '%',
        rawUnit: '%',
        signCharacter: detail.signCharacter,
      };
    case CssType.Ident:
    case CssType.Function:
      return {
        type: type === CssType.Ident ? 'ident' : 'function',
        value: detail.value,
        raw,
        pos,
        ws,
        index,
      };
    case CssType.OpenParen:
      return { type: 'punct', value: '(', raw, pos, ws, index };
    case CssType.CloseParen:
      return { type: 'punct', value: ')', raw, pos, ws, index };
    case CssType.Comma:
      return { type: 'punct', value: ',', raw, pos, ws, index };
    case CssType.Delim:
      if (isOperator(detail.value))
        return {
          type: 'punct',
          value: detail.value,
          raw,
          pos,
          ws,
          index,
        };
  }
  throw new Error(`Unexpected character "${raw[0] ?? ''}" at position ${pos}`);
}

/** @param {ParseInput} input @param {number} index @return {number} */
function eofPositionAt(input, index) {
  if (index < input.end && input.tokens[index][0] !== CssType.EOF) {
    return input.tokens[index][2];
  }
  if (
    input.end < input.tokens.length &&
    input.tokens[input.end][0] !== CssType.EOF
  ) {
    return input.tokens[input.end][2];
  }
  for (let i = Math.min(input.end, input.tokens.length) - 1; i >= 0; i--) {
    const token = input.tokens[i];
    if (token[0] !== CssType.EOF) return token[3] + 1;
  }
  return 0;
}

/** @param {ParseInput} input @param {Cursor} cursor @return {Token} */
function peekToken(input, cursor) {
  return cursor.lookahead ?? scanToken(input, cursor);
}

/**
 * Consume the cached token and advance to its native next index. This is one
 * of the only two operations allowed to advance `cursor.index`.
 * @param {ParseInput} input
 * @param {Cursor} cursor
 * @return {Token}
 */
function takeToken(input, cursor) {
  const token = peekToken(input, cursor);
  cursor.index = cursor.lookaheadNextIndex;
  cursor.firstToken = false;
  cursor.lookahead = null;
  return token;
}

/** @param {ParseInput} input @param {Cursor} cursor @param {Punctuator} value @param {Punctuator} [value2] @return {boolean} */
function isPunct(input, cursor, value, value2) {
  const t = peekToken(input, cursor);
  return (
    t.type === 'punct' &&
    (t.value === value || (value2 !== undefined && t.value === value2))
  );
}

/** @param {ParseInput} input @param {Cursor} cursor @param {Punctuator} value @return {boolean} */
function matchPunct(input, cursor, value) {
  if (!isPunct(input, cursor, value)) return false;
  takeToken(input, cursor);
  return true;
}

/** @param {ParseInput} input @param {Cursor} cursor @param {Punctuator} value @return {PunctToken} */
function expectPunct(input, cursor, value) {
  const t = takeToken(input, cursor);
  if (t.type !== 'punct' || t.value !== value) {
    throw new Error(`Expected ${value} at position ${t.pos}, got "${t.value}"`);
  }
  return t;
}

export {
  Cursor,
  eofPositionAt,
  expectPunct,
  isPunct,
  matchPunct,
  peekToken,
  sourceSpelling,
  takeToken,
};
