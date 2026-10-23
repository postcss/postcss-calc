// The text output of the printer: a sink that collects the printed strings.
// `sink.js` has the token-building counterpart.

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

/** The printed text of each binary operator, with the spaces the printer uses. */
const OPERATOR_TEXT = { '+': ' + ', '-': ' - ', '*': ' * ', '/': ' / ' };

/** A character that can continue or start an identifier, number or dimension. */
const NAME_CHAR = /[\w\-.\u0080-\uffff]/;

const DIGIT = /\d/;

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
 * The output of a printer that keeps its printed text as strings.
 */
class TextSink {
  /** @type {string[]} */
  parts = [];
  /** @type {boolean} */
  signed = false;

  /**
   * Write a space when a token starting with `first` would fuse with the
   * text before it. A sign belongs to the token that follows it.
   *
   * @param {string} first
   * @return {void}
   */
  separate(first) {
    if (this.signed) this.signed = false;
    else if (wouldFuse(this.parts.at(-1)?.at(-1), first)) this.parts.push(' ');
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
   * The raw text of `list[start, end)`.
   *
   * @param {CSSToken[]} list
   * @param {number} start
   * @param {number} end
   * @return {void}
   */
  source(list, start, end) {
    if (start < end) this.separate(list[start][1][0]);
    for (let i = start; i < end; i++) this.parts.push(list[i][1]);
  }

  /** @return {string} */
  join() {
    return this.parts.join('');
  }
}

export { TextSink, wouldFuse };
