// Token-range state for the recursive-descent parser: the cursor over one
// range, the whitespace rule for operators, and the checks that read a token
// without consuming it.
import { TokenType as CssType } from '@csstools/css-tokenizer';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

/**
 * A syntax error at a token. The position is not formatted here: a fallback
 * that fails to parse is discarded, so formatting it would be wasted work.
 * `parse()` formats the position when the error leaves the parser.
 */
class ParseError extends Error {
  /**
   * @param {string} message Text before the position.
   * @param {number} index Token whose source offset is the position.
   * @param {string} [suffix] Text after the position.
   */
  constructor(message, index, suffix = '') {
    super(message);
    this.index = index;
    this.suffix = suffix;
  }
}

/**
 * The error to report for `error`: a parse error gets the position added to
 * its message, and any other error is returned unchanged. The parse error is
 * reused because capturing a second stack trace dominates the cost of a
 * reported failure.
 *
 * @param {Error} error
 * @param {(index: number) => number} offsetOf Offset lookup for the list.
 * @return {Error}
 */
function positionedError(error, offsetOf) {
  if (!(error instanceof ParseError)) return error;
  error.message = `${error.message} at position ${offsetOf(error.index)}${error.suffix}`;
  return error;
}

/** @param {CssType} type @return {boolean} */
function isTrivia(type) {
  return (
    type === CssType.Whitespace ||
    type === CssType.Comment ||
    type === CssType.EOF
  );
}

/**
 * One parse range. `pos` is the next token to read. `close` is the closer
 * array for the whole list, shared by every range.
 *
 * @typedef {object} ParseState
 * @property {CSSToken[]} tokens
 * @property {Int32Array} close
 * @property {number} start First token of the range, for the leading-whitespace rule.
 * @property {number} end Exclusive bound.
 * @property {number} pos
 */

/** @param {string} value @return {value is '+' | '-' | '*' | '/'} */
function isOperator(value) {
  return value === '+' || value === '-' || value === '*' || value === '/';
}

/**
 * Whether the grammar can contain this token. Anything else is rejected where
 * it is read.
 *
 * @param {CSSToken} token
 * @return {boolean}
 */
function isExpressionToken(token) {
  switch (token[0]) {
    case CssType.Number:
    case CssType.Dimension:
    case CssType.Percentage:
    case CssType.Ident:
    case CssType.Function:
    case CssType.OpenParen:
    case CssType.CloseParen:
    case CssType.Comma:
      return true;
    case CssType.Delim:
      return isOperator(token[4].value);
  }
  return false;
}

/**
 * Index of the next token that is not trivia, or `state.end`.
 *
 * @param {ParseState} state
 * @return {number}
 */
function peek(state) {
  const { tokens, end } = state;
  let i = state.pos;
  while (i < end && isTrivia(tokens[i][0])) i++;
  if (i < end && !isExpressionToken(tokens[i])) {
    throw new ParseError(`Unexpected character "${tokens[i][1][0] ?? ''}"`, i);
  }
  return i;
}

/**
 * @param {CSSToken[]} tokens
 * @param {Int32Array} close
 * @param {number} start
 * @param {number} end
 * @return {ParseState}
 */
function newState(tokens, close, start, end) {
  return {
    tokens,
    close,
    start,
    end,
    pos: start,
  };
}

/**
 * Whether trivia (whitespace or a comment) separates the token at `index` from
 * the token before it. The start of the range counts as whitespace.
 *
 * @param {ParseState} state
 * @param {number} index
 * @return {boolean}
 */
function spaceBefore(state, index) {
  const { tokens, start } = state;
  for (let i = index - 1; i >= start; i--) {
    const type = tokens[i][0];
    if (type === CssType.Whitespace || type === CssType.Comment) return true;
    if (type !== CssType.EOF) return false;
  }
  return true;
}

/**
 * Whether trivia follows the token at `index` before the next token or the end
 * of the range. The end of the range counts as whitespace only if trivia
 * precedes it.
 *
 * @param {ParseState} state
 * @param {number} index
 * @return {boolean}
 */
function spaceAfter(state, index) {
  const { tokens, end } = state;
  for (let i = index + 1; i < end; i++) {
    const type = tokens[i][0];
    if (type === CssType.Whitespace || type === CssType.Comment) return true;
    if (type !== CssType.EOF) return false;
  }
  return false;
}

/**
 * The text a parse error shows for an expression token, as
 * `Expected ) ... got "..."`. Numbers show their value without the unit, and
 * names their decoded value.
 *
 * @param {CSSToken} token
 * @return {string}
 */
function tokenValue(token) {
  switch (token[0]) {
    case CssType.Number:
    case CssType.Dimension:
    case CssType.Percentage:
      return String(token[4].value);
    case CssType.Ident:
    case CssType.Function:
      return token[4].value;
  }
  return token[1];
}

/** @param {string} text @param {number} index @return {ParseError} */
function notSurrounded(text, index) {
  return new ParseError(`"${text}" must be surrounded by whitespace`, index);
}

/**
 * Read the operator at `index` and check that it is surrounded by whitespace.
 *
 * @param {ParseState} state
 * @param {number} index
 * @return {void}
 */
function requireSurroundingWhitespace(state, index) {
  if (!spaceBefore(state, index) || !spaceAfter(state, index)) {
    throw notSurrounded(state.tokens[index][1], index);
  }
}

/**
 * Read a numeric token that carries an explicit sign directly after an
 * operand. Such a token is rejected: the sign must be a separate operator.
 *
 * @param {ParseState} state
 * @return {void}
 */
function rejectSignedNumber(state) {
  const i = peek(state);
  if (i >= state.end) return;
  const token = state.tokens[i];
  if (
    token[0] !== CssType.Number &&
    token[0] !== CssType.Dimension &&
    token[0] !== CssType.Percentage
  ) {
    return;
  }
  const sign = token[4].signCharacter;
  if (sign === undefined) return;
  throw notSurrounded(sign, i);
}

export {
  ParseError,
  isTrivia,
  positionedError,
  newState,
  peek,
  rejectSignedNumber,
  requireSurroundingWhitespace,
  tokenValue,
};
