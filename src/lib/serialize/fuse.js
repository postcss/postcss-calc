// Adjacency rules shared by the printer's sinks and by the reducer core. They
// decide when a printed token would merge with the token beside it, and which
// tokens count as CSS at all.

import { TokenType } from '@csstools/css-tokenizer';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

/**
 * A character that can continue or start an identifier, number or dimension:
 * an ASCII letter, digit, `_`, `-` or `.`, or any code point from U+0080 up.
 * `/u` makes the class match whole code points. The ASCII ranges are spelled
 * out, since `\w` and `\d` are easy to misread as Unicode-aware.
 */
const NAME_CHAR = /[A-Za-z0-9_\-.\u0080-\u{10FFFF}]/u;

const DIGIT = /[0-9]/;

/**
 * Whether a token ending in `last` and a token starting with `first` would
 * read back as one token if written without a separator. The check is
 * conservative: it may ask for a separator that is not strictly needed.
 *
 * @param {string | undefined} last
 * @param {string | undefined} first
 * @return {boolean}
 */
function wouldFuse(last, first) {
  if (last === undefined || first === undefined) return false;
  // A digit continues into `%`, and a backslash starts an escape that
  // continues the name or unit before it.
  if (first === '%') return DIGIT.test(last);
  return (
    NAME_CHAR.test(last) &&
    (NAME_CHAR.test(first) || first === '(' || first === '\\')
  );
}

/**
 * What keeps a replacement apart from a neighbour it would fuse with. A space
 * rather than the empty comment CSS Syntax 3 §9 allows, because tools that
 * strip comments from values (such as minifiers run after this plugin) would
 * fuse the tokens again.
 */
const FUSE_SEPARATOR = ' ';

/**
 * Whether `token` is an end-of-file token. It marks the end of a tokenized
 * string, so one inside a list (for example from concatenated `tokenize`
 * results) is not part of the CSS and is skipped.
 *
 * @param {CSSToken | undefined} token
 * @return {boolean}
 */
function isEOF(token) {
  return token?.[0] === TokenType.EOF;
}

/**
 * The index of the first non-EOF token in `list[i, end)`, or `end` when there
 * is none.
 *
 * @param {CSSToken[]} list
 * @param {number} i
 * @param {number} end
 * @return {number}
 */
function nextCss(list, i, end) {
  let j = i;
  while (j < end && isEOF(list[j])) j++;
  return j;
}

/**
 * The first character of the first non-EOF token in `list[start, end)`.
 *
 * @param {CSSToken[]} list
 * @param {number} start
 * @param {number} end
 * @return {string | undefined}
 */
function firstCharOf(list, start, end) {
  for (let i = start; i < end; i++) {
    if (!isEOF(list[i])) return list[i][1][0];
  }
  return undefined;
}

/**
 * The last character of the last non-EOF token in `list[0, end)`.
 *
 * @param {CSSToken[]} list
 * @param {number} end
 * @return {string | undefined}
 */
function lastCharBefore(list, end) {
  for (let i = end - 1; i >= 0; i--) {
    if (!isEOF(list[i])) return list[i][1].at(-1);
  }
  return undefined;
}

export {
  FUSE_SEPARATOR,
  firstCharOf,
  isEOF,
  lastCharBefore,
  nextCss,
  wouldFuse,
};
