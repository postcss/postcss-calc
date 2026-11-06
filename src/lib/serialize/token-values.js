// Token values for the printer's token sink: the parsed value of an identifier,
// a numeric token's detail, and the raw-text match that lets a source token be reused.
import { TokenType } from '@csstools/css-tokenizer';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

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

export { decodeIdentifier, newToken, numericDetail, sameText };
