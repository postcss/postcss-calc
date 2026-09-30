// Pratt parser over native @csstools/css-tokenizer tokens.
import { baseOf } from './convertUnits.js';
import { call, dim, ident, mkProduct, mkSum, num } from './node.js';
import { isCalculationFunction, isSupportedMathFunction } from './functions.js';
import { assertDepth } from './limits.js';
import { parseOpaqueCall, parseVar } from './parser/opaque.js';
import {
  Cursor,
  expectPunct,
  isPunct,
  matchPunct,
  peekToken,
  sourceSpelling,
  takeToken,
} from './parser/tokens.js';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./parser/tokens.js').BlockIndex} BlockIndex */
/** @typedef {import('./parser/tokens.js').ParseInput} ParseInput */
/** @typedef {import('./parser/tokens.js').Token} Token */
/** @typedef {import('./parser/tokens.js').FunctionToken} FunctionToken */

/**
 * CSS numeric tokens do not retain a signed-zero distinction.  Keep that
 * normalization at the source boundary so a later IEEE-754 `-0` can only
 * have been introduced by calculation evaluation.
 *
 * @param {number} value
 * @return {number}
 */
function normalizeSourceZero(value) {
  return value === 0 ? 0 : value;
}

/** @param {ParseInput} input @param {Cursor} cursor @param {Token} token @param {number} depth @return {Node} */
function parsePrefix(input, cursor, token, depth) {
  switch (token.type) {
    case 'number':
      return num(normalizeSourceZero(token.value));
    case 'dimension': {
      const unit = token.unit.toLowerCase();
      return dim(
        normalizeSourceZero(token.value),
        unit,
        baseOf(unit) || token.rawUnit === unit ? undefined : token.rawUnit
      );
    }
    case 'ident':
      return (
        foldCalcKeyword(token.value) ??
        ident(token.value, sourceSpelling(token.raw, token.value))
      );
    case 'function':
      return parseCall(input, cursor, token, depth);
    case 'punct':
      switch (token.value) {
        case '(': {
          const expression = parseExpr(input, cursor, 0, depth + 1);
          expectPunct(input, cursor, ')');
          return expression.type === 'Sum'
            ? { ...expression, grouped: true }
            : expression;
        }
      }
    // No unary `+`/`-` production exists in the <calc-value> grammar; a
    // sign is only valid inside a number/dimension token or as a binary
    // operator. `-(...)` therefore fails to parse and is preserved.
  }
  throw new Error(`Unexpected token "${token.raw}" at position ${token.pos}`);
}

/** @param {ParseInput} input @param {Cursor} cursor @param {number} minBp @param {number} depth @return {Node} */
function parseExpr(input, cursor, minBp = 0, depth = 0) {
  assertDepth(depth);
  const t = takeToken(input, cursor);
  let left = parsePrefix(input, cursor, t, depth);

  while (true) {
    const nxt = peekToken(input, cursor);
    if (
      (nxt.type === 'number' || nxt.type === 'dimension') &&
      nxt.signCharacter !== undefined
    ) {
      throw new Error(
        `"${nxt.signCharacter}" must be surrounded by whitespace at position ${nxt.pos}`
      );
    }
    if (nxt.type !== 'punct') break;
    const op = nxt.value;
    if (op === '+' || op === '-') {
      if (ADD_BP < minBp) break;
      /** @type {import('./node.js').SumTerm[]} */
      const terms = [{ sign: /** @type {1} */ (1), node: left }];
      do {
        const token = takeToken(input, cursor);
        requireSurroundingWs(input, cursor, token);
        terms.push({
          sign: /** @type {1 | -1} */ (token.value === '+' ? 1 : -1),
          node: parseExpr(input, cursor, ADD_BP + 1, depth),
        });
      } while (isPunct(input, cursor, '+', '-'));
      left = mkSum(terms);
      continue;
    }
    if (op === '*' || op === '/') {
      if (MUL_BP < minBp) break;
      /** @type {import('./node.js').ProductFactor[]} */
      const factors = [{ exponent: /** @type {1} */ (1), node: left }];
      do {
        const token = takeToken(input, cursor);
        factors.push({
          exponent: /** @type {1 | -1} */ (token.value === '*' ? 1 : -1),
          node: parseExpr(input, cursor, MUL_BP + 1, depth),
        });
      } while (isPunct(input, cursor, '*', '/'));
      left = mkProduct(factors);
      continue;
    }
    break;
  }
  return left;
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

const ADD_BP = 1;
const MUL_BP = 3;
/** @param {ParseInput} input @param {Cursor} cursor @param {Token} token */
function requireSurroundingWs(input, cursor, token) {
  if (!token.ws || !peekToken(input, cursor).ws)
    throw new Error(
      `"${token.value}" must be surrounded by whitespace at position ${token.pos}`
    );
}

/** @param {ParseInput} input @param {Cursor} cursor @param {FunctionToken} t @param {number} depth @return {Node} */
function parseCall(input, cursor, t, depth) {
  const name = t.value;
  const rawName = t.raw.slice(0, -1);
  if (name.toLowerCase() === 'var')
    return parseVar(input, cursor, t, name, rawName, parseRange);
  if (!isCalculationFunction(name) && !isSupportedMathFunction(name))
    return parseOpaqueCall(input, cursor, t, name, rawName, parseRange);
  /** @type {Node[]} */ const args = [];
  if (!isPunct(input, cursor, ')')) {
    args.push(parseExpr(input, cursor, 0, depth + 1));
    while (matchPunct(input, cursor, ','))
      args.push(parseExpr(input, cursor, 0, depth + 1));
  }
  expectPunct(input, cursor, ')');
  return call(name, args, sourceSpelling(rawName, name));
}

/**
 * @param {ParseInput} input
 * @param {number} start
 * @param {number} end
 * @return {Node}
 */
function parseRange(input, start, end) {
  const bounded =
    input.end === end
      ? input
      : /** @type {ParseInput} */ ({
          tokens: input.tokens,
          end,
          index: input.index,
        });
  const cursor = new Cursor(start);
  const ast = parseExpr(bounded, cursor, 0, 0);
  const trailing = peekToken(bounded, cursor);
  if (trailing.type !== 'eof')
    throw new Error(
      `Unexpected token "${trailing.raw}" at position ${trailing.pos}`
    );
  return ast;
}

/** @param {CSSToken[]} tokens @param {number} start @param {number} end @param {BlockIndex} index @return {Node} */
function parse(tokens, start, end, index) {
  return parseRange({ tokens, end, index }, start, end);
}

export { parse };
