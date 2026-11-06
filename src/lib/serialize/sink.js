// The printer's output. A text sink collects the printed strings. A token
// sink builds the tokens of the same text directly, so the printer does not
// tokenize its own output, and it reuses the source token whenever the printed
// token has the same type and raw text.
import { TokenType } from '@csstools/css-tokenizer';

import { FUSE_SEPARATOR, firstCharOf, nextCss, wouldFuse } from './fuse.js';
import { TextSink } from './text-sink.js';
import {
  decodeIdentifier,
  newToken,
  numericDetail,
  sameText,
} from './token-values.js';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

/**
 * What the printer writes to, and what the reducer core calls on the printed
 * result. `TextSink` and `TokenSink` both implement it; the `@implements`
 * tags make `tsc` check that they keep doing so.
 *
 * @typedef {object} Sink
 * @property {() => void} open
 * @property {() => void} close
 * @property {() => void} comma
 * @property {(operator: '+' | '-' | '*' | '/') => void} op
 * @property {() => void} minus
 * @property {(name: string) => void} fn
 * @property {(raw: string) => void} ident
 * @property {(text: string) => void} number
 * @property {(text: string, unit: string) => void} dimension
 * @property {(list: CSSToken[], start: number, end: number) => void} source
 * @property {(before: string | undefined, after: string | undefined) => void} fit
 */

/**
 * A printed token, as a piece of the output. A number is a source token,
 * named by its index in the source list, and it is reused as it is. Any other
 * piece is a token the printer built, with unspecified offsets.
 *
 * @typedef {number | CSSToken} Piece
 */

/**
 * The parsed value of a token, copied so a replacement shares no object with
 * the source list.
 *
 * This is a shallow copy. The numeric details the tokenizer makes are flat, so
 * the copy shares nothing with the source. A detail that nests objects would
 * need a deep copy here.
 *
 * @param {unknown} detail
 * @return {unknown}
 */
function copyDetail(detail) {
  return detail !== null && typeof detail === 'object' ? { ...detail } : detail;
}

/**
 * A separator that keeps two tokens apart. It is always a new token, never a
 * source token reused by index, so a replacement that adds one no longer
 * matches the source range. All separator sites use this, and only this.
 *
 * @return {CSSToken}
 */
function fuseSeparator() {
  return newToken(TokenType.Whitespace, FUSE_SEPARATOR, undefined);
}

/**
 * The output of a printer that builds tokens. The printed pieces are compared
 * with the source range `[start, end)`: when they are that range's non-EOF
 * tokens in order, each one a source index, the output is the source range
 * unchanged. Tokens are only built, and copied, by `build`.
 *
 * EOF tokens take no part in matching, because printed output never holds
 * them.
 *
 * @implements {Sink}
 */
class TokenSink {
  /** @type {Piece[]} */
  pieces = [];
  /** @type {boolean} */
  minusPending = false;
  /** @type {CSSToken[]} */ sourceTokens;
  /** @type {number} */ start;
  /** @type {number} */ end;

  /**
   * @param {CSSToken[]} source
   * @param {number} start
   * @param {number} end
   */
  constructor(source, start, end) {
    this.sourceTokens = source;
    this.start = start;
    this.end = end;
  }

  /**
   * The source index that the next printed token must have to be reused, or
   * -1 once the output has diverged. Only the last piece decides: a built
   * token ends reuse, and every later token is built too.
   *
   * @return {number}
   */
  expectedIndex() {
    const last = this.pieces.at(-1);
    if (last === undefined) {
      return nextCss(this.sourceTokens, this.start, this.end);
    }
    if (typeof last !== 'number') return -1;
    return nextCss(this.sourceTokens, last + 1, this.end);
  }

  /**
   * Whether the pieces are the source range, token for token.
   *
   * @return {boolean}
   */
  identical() {
    if (this.minusPending) return false;
    let expected = nextCss(this.sourceTokens, this.start, this.end);
    for (const piece of this.pieces) {
      if (piece !== expected) return false;
      expected = nextCss(this.sourceTokens, expected + 1, this.end);
    }
    return expected === this.end;
  }

  /**
   * The tokens of the output. Each one carries offsets that locate it in the
   * output text, counting from 0, and a copied parsed value, so the result
   * shares no object with the source list.
   *
   * @return {CSSToken[]}
   */
  build() {
    let offset = 0;
    return this.pieces.map((piece) => {
      const token =
        typeof piece === 'number' ? this.sourceTokens[piece] : piece;
      const from = offset;
      offset += token[1].length;
      return /** @type {CSSToken} */ (
        /** @type {unknown} */ ([
          token[0],
          token[1],
          from,
          offset - 1,
          copyDetail(token[4]),
        ])
      );
    });
  }

  /**
   * The text of a piece.
   *
   * @param {Piece} piece
   * @return {string}
   */
  textOf(piece) {
    return typeof piece === 'number' ? this.sourceTokens[piece][1] : piece[1];
  }

  /**
   * Append the source token at the expected index when it has `type` and raw
   * text `prefix + first + last`. Returns false otherwise, and the caller
   * builds the token.
   *
   * @param {TokenType} type
   * @param {string} prefix
   * @param {string} first
   * @param {string} last
   * @return {boolean}
   */
  reuse(type, prefix, first, last) {
    const index = this.expectedIndex();
    if (index !== -1 && index < this.end) {
      const token = this.sourceTokens[index];
      if (token[0] === type && sameText(token[1], prefix, first, last)) {
        this.pieces.push(index);
        return true;
      }
    }
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
    const last = this.pieces.at(-1);
    if (last !== undefined && wouldFuse(this.textOf(last).at(-1), first))
      this.pieces.push(fuseSeparator());
  }

  /**
   * Keep the printed tokens apart from the tokens around them: `before` and
   * `after` are the neighbours' adjacent characters. Added separators are
   * built tokens, so the output no longer matches the source range.
   *
   * @param {string | undefined} before
   * @param {string | undefined} after
   * @return {void}
   */
  fit(before, after) {
    const head = this.pieces[0];
    const tail = this.pieces.at(-1);
    const first = head === undefined ? undefined : this.textOf(head)[0];
    const last = tail === undefined ? undefined : this.textOf(tail).at(-1);
    if (wouldFuse(before, first)) this.pieces.unshift(fuseSeparator());
    if (wouldFuse(last, after)) this.pieces.push(fuseSeparator());
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
        this.pieces.push(newToken(TokenType.Delim, '-', { value: '-' }));
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
      this.pieces.push(newToken(type, raw, detail));
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
      this.pieces.push(
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
      this.pieces.push(
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
    this.pieces.push(
      newToken(type, `${number}${unit}`, numericDetail(type, number, unit))
    );
  }

  /**
   * The raw tokens `list[start, end)` of an opaque component. Source tokens
   * of the sink's own list are reused by index when the range starts at the
   * expected index; any other token is kept by reference as a built token.
   *
   * @param {CSSToken[]} list
   * @param {number} start
   * @param {number} end
   * @return {void}
   */
  source(list, start, end) {
    this.flushMinus();
    const first = firstCharOf(list, start, end);
    if (first !== undefined) this.separate(first);
    const from = nextCss(list, start, end);
    const reusable =
      list === this.sourceTokens && this.expectedIndex() === from;
    // An EOF token is not CSS, so it is never copied into a replacement.
    for (let i = from; i < end; i = nextCss(list, i + 1, end)) {
      this.pieces.push(reusable ? i : list[i]);
    }
  }
}

export { TextSink, TokenSink, decodeIdentifier, numericDetail, sameText };
