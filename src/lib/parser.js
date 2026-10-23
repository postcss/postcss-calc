// Recursive-descent parser over native @csstools/css-tokenizer tokens.
//
// A range is `[start, end)` of token indices. Whitespace, comments and
// end-of-file tokens are trivia: they separate tokens but are never parsed.
// A parenthesized group or argument list is parsed over a sub-range that
// includes its closing parenthesis, so the closer is read as an ordinary token
// and must be the next token once the contents are consumed.
import { TokenType as CssType } from '@csstools/css-tokenizer';
import { baseOf } from './convertUnits.js';
import {
  call,
  dim,
  ident,
  groupSubstitution,
  mkProduct,
  mkSum,
  num,
} from './node.js';
import { lookupMathFunction } from './functions.js';
import { assertDepth } from './limits.js';
import { closeIn, matchBlocks } from './blocks.js';
import { offsetLookup } from './offsets.js';
import { parseOpaqueCall, parseVar } from './parser/opaque.js';
import { sourceSpelling } from './parser/tokens.js';
import { CSS_NUMBER_PREFIX } from './regex.js';
/** @typedef {import('./parser/state.js').ParseState} ParseState */
import {
  ParseError,
  positionedError,
  newState,
  peek,
  rejectSignedNumber,
  requireSurroundingWhitespace,
  tokenValue,
} from './parser/state.js';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./node.js').SumTerm} SumTerm */
/** @typedef {import('./node.js').ProductFactor} ProductFactor */

/**
 * @callback ParseRange
 * @param {CSSToken[]} tokens
 * @param {Int32Array} close
 * @param {number} start
 * @param {number} end
 * @return {Node}
 */

/**
 * CSS numeric tokens do not retain a signed-zero distinction. Keep that
 * normalization at the source boundary so a later IEEE-754 `-0` can only
 * have been introduced by calculation evaluation.
 *
 * @param {number} value
 * @return {number}
 */
function normalizeSourceZero(value) {
  return value === 0 ? 0 : value;
}

/**
 * The delimiter at `index` when it is `a` or `b`, else undefined.
 *
 * @param {ParseState} state
 * @param {number} index
 * @param {string} a
 * @param {string} b
 * @return {string | undefined}
 */
function delimAt(state, index, a, b) {
  const token = state.tokens[index];
  if (token[0] !== CssType.Delim) return undefined;
  const op = token[4].value;
  return op === a || op === b ? op : undefined;
}

/**
 * Sum: products joined by `+` and `-`, which must be surrounded by whitespace.
 *
 * @param {ParseState} state
 * @param {number} depth
 * @return {Node}
 */
function parseSum(state, depth) {
  assertDepth(depth);
  const first = parseProduct(state, depth);
  /** @type {SumTerm[]} */
  const terms = [{ sign: 1, node: first }];
  for (let i = peek(state); i < state.end; i = peek(state)) {
    const op = delimAt(state, i, '+', '-');
    if (op === undefined) break;
    requireSurroundingWhitespace(state, i);
    state.pos = i + 1;
    terms.push({
      sign: op === '+' ? 1 : -1,
      node: parseProduct(state, depth),
    });
  }
  return terms.length === 1 ? first : mkSum(terms);
}

/**
 * Product: operands joined by `*` and `/`. Whitespace is not required.
 *
 * @param {ParseState} state
 * @param {number} depth
 * @return {Node}
 */
function parseProduct(state, depth) {
  const first = parseOperand(state, depth);
  /** @type {ProductFactor[]} */
  const factors = [{ exponent: 1, node: first }];
  for (let i = peek(state); i < state.end; i = peek(state)) {
    const op = delimAt(state, i, '*', '/');
    if (op === undefined) break;
    state.pos = i + 1;
    factors.push({
      exponent: op === '*' ? 1 : -1,
      node: parseOperand(state, depth),
    });
  }
  return factors.length === 1 ? first : mkProduct(factors);
}

/**
 * One operand, followed by the check that no signed number directly follows it.
 *
 * @param {ParseState} state
 * @param {number} depth
 * @return {Node}
 */
function parseOperand(state, depth) {
  const node = parseValue(state, depth);
  rejectSignedNumber(state);
  return node;
}

/** §10.9 — case-insensitive except for NaN. @param {string} name @return {Node | null} */
function foldCalcKeyword(name) {
  if (name === 'NaN' || name === '-NaN') return num(Number.NaN);
  switch (name.toLowerCase()) {
    case 'pi':
      return num(Math.PI);
    case 'e':
      return num(Math.E);
    case 'infinity':
      return num(Infinity);
    case '-infinity':
      return num(-Infinity);
  }
  return null;
}

/**
 * One value: a number, dimension, keyword, function, or parenthesized group.
 * A unary sign is not part of the <calc-value> grammar, so `-(...)` is
 * rejected here.
 *
 * @param {ParseState} state
 * @param {number} depth
 * @return {Node}
 */
function parseValue(state, depth) {
  const i = peek(state);
  if (i >= state.end) throw new ParseError('Unexpected token ""', i);
  const token = state.tokens[i];
  state.pos = i + 1;
  switch (token[0]) {
    case CssType.Number:
      return num(normalizeSourceZero(token[4].value));
    case CssType.Dimension:
    case CssType.Percentage:
      return dimension(token);
    case CssType.Ident:
      return (
        foldCalcKeyword(token[4].value) ??
        ident(token[4].value, sourceSpelling(token[1], token[4].value))
      );
    case CssType.Function:
      return parseCall(state, i, depth);
    case CssType.OpenParen:
      return parseGroup(state, i, depth);
  }
  throw new ParseError(`Unexpected token "${token[1]}"`, i);
}

/**
 * @param {CSSToken} token
 * @return {Node}
 */
function dimension(token) {
  const detail = /** @type {{value: number, unit: string}} */ (token[4]);
  const value = normalizeSourceZero(detail.value);
  if (token[0] === CssType.Percentage) return dim(value, '%');
  const unit = detail.unit.toLowerCase();
  const match = CSS_NUMBER_PREFIX.exec(token[1]);
  const rawUnit = match ? token[1].slice(match[0].length) : detail.unit;
  return dim(
    value,
    unit,
    baseOf(unit) || rawUnit === unit ? undefined : rawUnit
  );
}

/**
 * A parenthesized group. Its contents must be followed by the closing
 * parenthesis.
 *
 * @param {ParseState} state
 * @param {number} open Index of the `(` token.
 * @param {number} depth
 * @return {Node}
 */
function parseGroup(state, open, depth) {
  const closer = closeIn(state.close, open, state.end);
  const sub = subRange(state, open, closer);
  const expression = parseSum(sub, depth + 1);
  expectCloser(sub, closer);
  state.pos = closer + 1;
  return groupSubstitution(expression);
}

/**
 * @param {ParseState} state
 * @param {number} open
 * @param {number} closer `-1` when unclosed.
 * @return {ParseState}
 */
function subRange(state, open, closer) {
  const end = closer === -1 ? state.end : closer + 1;
  return newState(state.tokens, state.close, open + 1, end);
}

/**
 * Consume the closing parenthesis of a sub-range, or fail on the token that
 * stands in its place.
 *
 * @param {ParseState} sub
 * @param {number} closer
 * @return {void}
 */
function expectCloser(sub, closer) {
  const i = peek(sub);
  if (closer !== -1 && i === closer) {
    sub.pos = i + 1;
    return;
  }
  throw new ParseError(
    'Expected )',
    i,
    `, got "${i < sub.end ? tokenValue(sub.tokens[i]) : ''}"`
  );
}

/**
 * A function call to a supported math function (`min()`, `clamp()`, ...), or
 * an opaque or substitution function.
 *
 * @param {ParseState} state
 * @param {number} index Index of the function token.
 * @param {number} depth
 * @return {Node}
 */
function parseCall(state, index, depth) {
  const token = state.tokens[index];
  const name = /** @type {{value: string}} */ (token[4]).value;
  const rawName = token[1].slice(0, -1);
  if (name.toLowerCase() === 'var')
    return parseVar(state, index, name, rawName, parseRange);
  if (lookupMathFunction(name) === undefined)
    return parseOpaqueCall(state, index, name, rawName, parseRange);
  const closer = closeIn(state.close, index, state.end);
  const sub = subRange(state, index, closer);
  /** @type {Node[]} */
  const args = [];
  if (peek(sub) !== closer) {
    args.push(parseSum(sub, depth + 1));
    for (
      let i = peek(sub);
      i < sub.end && sub.tokens[i][0] === CssType.Comma;
      i = peek(sub)
    ) {
      sub.pos = i + 1;
      args.push(parseSum(sub, depth + 1));
    }
  }
  expectCloser(sub, closer);
  state.pos = closer + 1;
  return call(name, args, sourceSpelling(rawName, name));
}

/**
 * Parse `[start, end)` as one complete expression.
 *
 * @param {CSSToken[]} tokens
 * @param {Int32Array} close
 * @param {number} start
 * @param {number} end
 * @return {Node}
 */
function parseRange(tokens, close, start, end) {
  const state = newState(tokens, close, start, end);
  const ast = parseSum(state, 0);
  const trailing = peek(state);
  if (trailing < end) {
    throw new ParseError(`Unexpected token "${tokens[trailing][1]}"`, trailing);
  }
  return ast;
}

/**
 * The closer array for `tokens`, rejected when the list nests past the limit.
 * `parse()` uses it when its caller supplies no closer array.
 *
 * @param {CSSToken[]} tokens
 * @return {Int32Array}
 */
function closersWithinLimit(tokens) {
  const { close, maxDepth } = matchBlocks(tokens);
  assertDepth(maxDepth);
  return close;
}

/**
 * Parse the token range `[start, end)` of `tokens` as one calculation.
 * `close` is the closer array from `matchBlocks(tokens)`; when omitted, it is
 * built and depth-checked from `tokens`.
 *
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @param {Int32Array} [close]
 * @return {Node}
 */
function parse(tokens, start, end, close = closersWithinLimit(tokens)) {
  try {
    return parseRange(tokens, close, start, end);
  } catch (error) {
    if (error instanceof ParseError) {
      throw positionedError(error, offsetLookup(tokens));
    }
    throw error;
  }
}

export { parse, parseRange };
