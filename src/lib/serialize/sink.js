// The printer's output. A text sink collects the printed strings. A token
// sink builds the tokens of the same text directly, so the printer does not
// tokenize its own output, and it reuses the source token whenever the printed
// token has the same type and raw text.
import { TokenType } from '@csstools/css-tokenizer';

import { TextSink, wouldFuse } from './text-sink.js';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

/**
 * What the printer writes to. `TextSink` and `TokenSink` both implement it, so
 * a method added to one must be added to the other.
 *
 * @typedef {TextSink | TokenSink} Sink
 */

/**
 * Whether `raw` is `prefix + first + last`, without building that string.
 *
 * @param {string} raw
 * @param {string} prefix
 * @param {string} first
 * @param {string} last
 * @return {boolean}
 */
function sameText(raw, prefix, first, last) {
  return (
    raw.length === prefix.length + first.length + last.length &&
    raw.startsWith(prefix) &&
    raw.startsWith(first, prefix.length) &&
    raw.endsWith(last)
  );
}

/**
 * The value of a CSS identifier from its raw text: each escape is replaced by
 * the code point it names, so `c\61 lc` reads `calc`.
 *
 * @param {string} raw
 * @return {string}
 */
function decodeIdentifier(raw) {
  if (!raw.includes('\\')) return raw;
  let value = '';
  let i = 0;
  while (i < raw.length) {
    const char = raw[i];
    if (char !== '\\') {
      value += char;
      i++;
      continue;
    }
    // A backslash at the end of the input is a parse error that reads U+FFFD.
    if (i + 1 === raw.length) {
      value += '\ufffd';
      break;
    }
    const hex = /^[0-9a-fA-F]{1,6}/.exec(raw.slice(i + 1, i + 7));
    if (hex === null) {
      value += raw[i + 1];
      i += 2;
      continue;
    }
    const codePoint = Number.parseInt(hex[0], 16);
    const valid =
      codePoint !== 0 &&
      codePoint <= 0x10ffff &&
      (codePoint < 0xd800 || codePoint > 0xdfff);
    value += String.fromCodePoint(valid ? codePoint : 0xfffd);
    i += 1 + hex[0].length;
    // One whitespace after a hex escape belongs to it; CRLF counts as one.
    if (raw.startsWith('\r\n', i)) i += 2;
    else if (/[ \t\n\f\r]/.test(raw[i] ?? '')) i++;
  }
  return value;
}

/**
 * The detail object of a numeric token, as the tokenizer makes it.
 *
 * @param {TokenType} type
 * @param {string} number The signed number text.
 * @param {string} unit
 * @return {object}
 */
function numericDetail(type, number, unit) {
  /** @type {{value: number, signCharacter?: '-', type?: 'integer' | 'number', unit?: string}} */
  // The tokenizer always has the key, `undefined` when the number is unsigned.
  const detail = {
    value: Number(number),
    signCharacter: number.startsWith('-') ? '-' : undefined,
  };
  if (type !== TokenType.Percentage) {
    detail.type = /^[+-]?\d+$/.test(number) ? 'integer' : 'number';
  }
  if (type === TokenType.Dimension) detail.unit = decodeIdentifier(unit);
  return detail;
}

/**
 * A printed token. Its offsets are unspecified.
 *
 * @param {TokenType} type
 * @param {string} raw
 * @param {object | null | undefined} detail
 * @return {CSSToken}
 */
function newToken(type, raw, detail) {
  return /** @type {CSSToken} */ (
    /** @type {unknown} */ ([type, raw, 0, 0, detail])
  );
}

/**
 * The output of a printer that builds tokens. `source[start, end)` is the
 * list the printed tokens are compared with: while the printed tokens match
 * it in order, each one is the source token itself. Once one differs, the
 * rest are new tokens with unspecified offsets.
 */
class TokenSink {
  /** @type {CSSToken[]} */
  tokens = [];
  /** @type {boolean} */
  minusPending = false;
  /** @type {boolean} */
  matching = true;
  /** @type {number} */
  cursor;
  /** @type {CSSToken[]} */ sourceTokens;
  /** @type {number} */ end;

  /**
   * @param {CSSToken[]} source
   * @param {number} start
   * @param {number} end
   */
  constructor(source, start, end) {
    this.sourceTokens = source;
    this.cursor = start;
    this.end = end;
  }

  /**
   * Whether the printed tokens are the source range, token for token.
   *
   * @return {boolean}
   */
  identical() {
    return this.matching && !this.minusPending && this.cursor === this.end;
  }

  /**
   * Append the source token at the cursor when it has `type` and raw text
   * `prefix + first + last`. Otherwise the output has diverged for good.
   *
   * @param {TokenType} type
   * @param {string} prefix
   * @param {string} first
   * @param {string} last
   * @return {boolean}
   */
  reuse(type, prefix, first, last) {
    if (this.matching && this.cursor < this.end) {
      const token = this.sourceTokens[this.cursor];
      if (token[0] === type && sameText(token[1], prefix, first, last)) {
        this.tokens.push(token);
        this.cursor++;
        return true;
      }
    }
    this.matching = false;
    return false;
  }

  /**
   * Write a space when a token starting with `first` would fuse with the
   * token before it.
   *
   * @param {string} first
   * @return {void}
   */
  separate(first) {
    if (wouldFuse(this.tokens.at(-1)?.[1].at(-1), first))
      this.push(TokenType.Whitespace, ' ', undefined);
  }

  /**
   * Keep the printed tokens apart from the tokens around them: `before` and
   * `after` are the neighbours' adjacent characters. The printed tokens no
   * longer match the source range once a separator is added.
   *
   * @param {string | undefined} before
   * @param {string | undefined} after
   * @return {void}
   */
  fit(before, after) {
    const first = this.tokens[0]?.[1][0];
    const last = this.tokens.at(-1)?.[1].at(-1);
    if (wouldFuse(before, first)) {
      this.tokens.unshift(newToken(TokenType.Whitespace, ' ', undefined));
      this.matching = false;
    }
    if (wouldFuse(last, after)) {
      this.tokens.push(newToken(TokenType.Whitespace, ' ', undefined));
      this.matching = false;
    }
  }

  /** @return {string} The pending sign, or `''`. */
  takeMinus() {
    const prefix = this.minusPending ? '-' : '';
    this.minusPending = false;
    return prefix;
  }

  /** A pending sign that no token absorbed is a delimiter. @return {void} */
  flushMinus() {
    if (this.minusPending) {
      this.minusPending = false;
      if (!this.reuse(TokenType.Delim, '', '-', ''))
        this.tokens.push(newToken(TokenType.Delim, '-', { value: '-' }));
    }
  }

  /**
   * @param {TokenType} type
   * @param {string} raw
   * @param {object | null | undefined} detail
   * @return {void}
   */
  push(type, raw, detail) {
    if (!this.reuse(type, '', raw, '')) {
      this.tokens.push(newToken(type, raw, detail));
    }
  }

  /** @return {void} */
  open() {
    this.flushMinus();
    this.push(TokenType.OpenParen, '(', undefined);
  }

  /** @return {void} */
  close() {
    this.flushMinus();
    this.push(TokenType.CloseParen, ')', undefined);
  }

  /** @return {void} */
  comma() {
    this.flushMinus();
    this.push(TokenType.Comma, ',', undefined);
    this.push(TokenType.Whitespace, ' ', undefined);
  }

  /**
   * @param {'+' | '-' | '*' | '/'} operator
   * @return {void}
   */
  op(operator) {
    this.flushMinus();
    this.push(TokenType.Whitespace, ' ', undefined);
    this.push(TokenType.Delim, operator, { value: operator });
    this.push(TokenType.Whitespace, ' ', undefined);
  }

  /** @return {void} */
  minus() {
    this.minusPending = true;
  }

  /** @param {string} name @return {void} */
  fn(name) {
    const prefix = this.takeMinus();
    this.separate((prefix || name)[0]);
    if (!this.reuse(TokenType.Function, prefix, name, '(')) {
      this.tokens.push(
        newToken(TokenType.Function, `${prefix}${name}(`, {
          value: decodeIdentifier(`${prefix}${name}`),
        })
      );
    }
  }

  /** @param {string} raw @return {void} */
  ident(raw) {
    const prefix = this.takeMinus();
    this.separate((prefix || raw)[0]);
    if (!this.reuse(TokenType.Ident, prefix, raw, '')) {
      this.tokens.push(
        newToken(TokenType.Ident, `${prefix}${raw}`, {
          value: decodeIdentifier(`${prefix}${raw}`),
        })
      );
    }
  }

  /** @param {string} text @return {void} */
  number(text) {
    this.numeric(TokenType.Number, text, '');
  }

  /**
   * @param {string} text
   * @param {string} unit
   * @return {void}
   */
  dimension(text, unit) {
    this.numeric(
      unit === '%' ? TokenType.Percentage : TokenType.Dimension,
      text,
      unit
    );
  }

  /**
   * @param {TokenType} type
   * @param {string} text
   * @param {string} unit
   * @return {void}
   */
  numeric(type, text, unit) {
    const prefix = this.takeMinus();
    this.separate((prefix || text)[0]);
    if (this.reuse(type, prefix, text, unit)) return;
    const number = `${prefix}${text}`;
    this.tokens.push(
      newToken(type, `${number}${unit}`, numericDetail(type, number, unit))
    );
  }

  /**
   * The raw tokens `list[start, end)` of an opaque component. Source tokens
   * are appended by reference, and they keep the cursor only when they start
   * exactly where the printed tokens are.
   *
   * @param {CSSToken[]} list
   * @param {number} start
   * @param {number} end
   * @return {void}
   */
  source(list, start, end) {
    this.flushMinus();
    if (start < end) this.separate(list[start][1][0]);
    if (this.matching && this.cursor === start) this.cursor = end;
    else this.matching = false;
    for (let i = start; i < end; i++) this.tokens.push(list[i]);
  }
}

export { TextSink, TokenSink, decodeIdentifier, numericDetail, sameText };
