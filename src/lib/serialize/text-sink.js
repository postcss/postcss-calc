// The text output of the printer: a sink that collects the printed strings.
// `sink.js` has the token-building counterpart.

import { FUSE_SEPARATOR, firstCharOf, isEOF, wouldFuse } from './fuse.js';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('./sink.js').Sink} Sink */

/** The printed text of each binary operator, with the spaces the printer uses. */
const OPERATOR_TEXT = { '+': ' + ', '-': ' - ', '*': ' * ', '/': ' / ' };

/**
 * The output of a printer that keeps its printed text as strings.
 *
 * @implements {Sink}
 */
class TextSink {
  /** @type {string[]} */
  parts = [];
  /** @type {boolean} */
  signed = false;
  /** Text written before `parts`, set by `fit` to avoid shifting them. @type {string} */
  leading = '';

  /**
   * Write a space when a token starting with `first` would fuse with the
   * text before it. A sign belongs to the token that follows it.
   *
   * @param {string} first
   * @return {void}
   */
  separate(first) {
    if (this.signed) this.signed = false;
    else if (wouldFuse(this.parts.at(-1)?.at(-1), first)) {
      this.parts.push(FUSE_SEPARATOR);
    }
  }

  /** @return {void} */
  open() {
    this.parts.push('(');
  }

  /** @return {void} */
  close() {
    this.parts.push(')');
  }

  /** @return {void} */
  comma() {
    this.parts.push(', ');
  }

  /**
   * @param {'+' | '-' | '*' | '/'} operator
   * @return {void}
   */
  op(operator) {
    this.parts.push(OPERATOR_TEXT[operator]);
  }

  /** The sign of the next number, identifier or function. @return {void} */
  minus() {
    this.separate('-');
    this.parts.push('-');
    this.signed = true;
  }

  /** @param {string} name @return {void} */
  fn(name) {
    this.separate(name[0]);
    this.parts.push(name, '(');
  }

  /** @param {string} raw @return {void} */
  ident(raw) {
    this.separate(raw[0]);
    this.parts.push(raw);
  }

  /** @param {string} text @return {void} */
  number(text) {
    this.separate(text[0]);
    this.parts.push(text);
  }

  /**
   * @param {string} text
   * @param {string} unit
   * @return {void}
   */
  dimension(text, unit) {
    this.separate(text[0]);
    this.parts.push(text, unit);
  }

  /**
   * The raw text of `list[start, end)`. EOF tokens are skipped, as the token
   * sink skips them, so an empty part never hides the last character from
   * the next separator check.
   *
   * @param {CSSToken[]} list
   * @param {number} start
   * @param {number} end
   * @return {void}
   */
  source(list, start, end) {
    const first = firstCharOf(list, start, end);
    if (first !== undefined) this.separate(first);
    for (let i = start; i < end; i++) {
      if (!isEOF(list[i])) this.parts.push(list[i][1]);
    }
  }

  /**
   * Keep the printed text apart from the text around it: `before` and `after`
   * are the neighbours' adjacent characters.
   *
   * @param {string | undefined} before
   * @param {string | undefined} after
   * @return {void}
   */
  fit(before, after) {
    const { parts } = this;
    let first;
    for (let i = 0; i < parts.length && first === undefined; i++) {
      first = parts[i][0];
    }
    let last;
    for (let i = parts.length - 1; i >= 0 && last === undefined; i--) {
      last = parts[i].at(-1);
    }
    if (wouldFuse(before, first)) this.leading = FUSE_SEPARATOR;
    if (wouldFuse(last, after)) parts.push(FUSE_SEPARATOR);
  }

  /** @return {string} */
  join() {
    return this.leading + this.parts.join('');
  }
}

export { TextSink };
