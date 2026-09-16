// Pratt parser over native @csstools/css-tokenizer tokens.
import { TokenType as CssType } from '@csstools/css-tokenizer';
import { baseOf } from './convertUnits.js';
import {
  call,
  dim,
  ident,
  mkProduct,
  mkSum,
  negate,
  num,
  opaqueCall,
} from './node.js';
import { isCalculationFunction, isSupportedMathFunction } from './functions.js';
import { assertDepth } from './limits.js';
import { CSS_NUMBER_PREFIX } from './regex.js';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./node.js').OpaqueComponent} OpaqueComponent */
/** @typedef {ReturnType<typeof import('./block-index.js').indexBlocks>} BlockIndex */
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

/** @param {OpaqueComponent[]} target @param {OpaqueComponent} part */
function pushComponent(target, part) {
  if (typeof part === 'string' && typeof target.at(-1) === 'string')
    target[target.length - 1] += part;
  else target.push(part);
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
        case '-':
          return negate(parseExpr(input, cursor, 7, depth + 1));
        case '+':
          return parseExpr(input, cursor, 7, depth + 1);
      }
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
    const infixKey = nxt.type === 'punct' ? String(nxt.value) : nxt.type;
    const rule = INFIX[infixKey];
    if (!rule || rule.lbp < minBp) break;
    if (infixKey === '+' || infixKey === '-') {
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
    if (infixKey === '*' || infixKey === '/') {
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
/** @param {ParseInput} input @param {Cursor} cursor @param {FunctionToken} token @param {string} name @param {string} rawName @return {Node} */
function parseOpaqueCall(input, cursor, token, name, rawName) {
  const start = token.index + 1;
  const close = input.index.closeOf(token.index, input.end);
  if (close === -1)
    throw new Error(
      `Unclosed ${name}( at position ${eofPositionAt(input, cursor.index)}`
    );
  cursor.skipTo(close + 1);
  return opaqueCall(
    name,
    componentTree(input, start, close),
    sourceSpelling(rawName, name)
  );
}

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
    return parseVar(input, cursor, t, name, rawName);
  if (!isCalculationFunction(name) && !isSupportedMathFunction(name))
    return parseOpaqueCall(input, cursor, t, name, rawName);
  /** @type {Node[]} */ const args = [];
  if (!isPunct(input, cursor, ')')) {
    args.push(parseExpr(input, cursor, 0, depth + 1));
    while (matchPunct(input, cursor, ','))
      args.push(parseExpr(input, cursor, 0, depth + 1));
  }
  expectPunct(input, cursor, ')');
  return call(name, args, sourceSpelling(rawName, name));
}

/** @param {CSSToken[]} tokens @param {number} start @param {number} end */
function rawTokens(tokens, start, end) {
  let raw = '';
  for (let i = start; i < end; i++) raw += tokens[i][1];
  return raw;
}
/** @param {CSSToken[]} tokens @param {number} start @param {number} end */
function customProperty(tokens, start, end) {
  /** @type {CSSToken | null} */
  let found = null;
  let foundIndex = -1;
  for (let i = start; i < end; i++) {
    const type = tokens[i][0];
    if (type === CssType.Whitespace || type === CssType.Comment) continue;
    if (found !== null) return null;
    found = tokens[i];
    foundIndex = i;
  }
  if (!found || found[0] !== CssType.Ident) return null;
  const decoded = found[4].value;
  return decoded.startsWith('--') && decoded !== '--'
    ? { decoded, raw: found[1], index: foundIndex }
    : null;
}
/** @param {ParseInput} input @param {number} start @param {number} end @param {number} [depth] @return {OpaqueComponent[]} */
function componentTree(input, start, end, depth = 0) {
  assertDepth(depth);
  /** @type {OpaqueComponent[]} */ const root = [];
  /** @type {OpaqueComponent[]} */ let tree = root;
  /** @type {{parent: OpaqueComponent[], tree: OpaqueComponent[], close: number, end: number}[]} */
  const frames = [];
  const { tokens } = input;
  let i = start;
  while (true) {
    if (i >= end) {
      if (frames.length === 0) break;
      const frame =
        /** @type {{parent: OpaqueComponent[], tree: OpaqueComponent[], close: number, end: number}} */ (
          frames.pop()
        );
      tree = frame.parent;
      pushComponent(tree, frame.tree);
      pushComponent(tree, tokens[frame.close][1]);
      end = frame.end;
      i = frame.close + 1;
      continue;
    }

    const token = tokens[i];
    const close = input.index.closeOf(i, end);
    if (close === -1) {
      pushComponent(tree, token[1]);
      i++;
      continue;
    }

    const isMathFunction =
      token[0] === CssType.Function &&
      (isCalculationFunction(token[4].value) ||
        isSupportedMathFunction(token[4].value));
    if (isMathFunction) {
      try {
        pushComponent(tree, parseRange(input, i, close + 1));
      } catch {
        pushComponent(tree, rawTokens(tokens, i, close + 1));
      }
      i = close + 1;
      continue;
    }

    pushComponent(tree, token[1]);
    assertDepth(depth + frames.length + 1);
    /** @type {OpaqueComponent[]} */
    const child = [];
    frames.push({ parent: tree, tree: child, close, end });
    tree = child;
    end = close;
    i++;
  }
  return root;
}
/** @param {ParseInput} input @param {Cursor} cursor @param {FunctionToken} token @param {string} name @param {string} rawName @return {Node} */
function parseVar(input, cursor, token, name, rawName) {
  const { tokens } = input;
  const start = token.index + 1;
  const close = input.index.closeOf(token.index, input.end);
  if (close === -1)
    throw new Error(
      `Unclosed ${name}( at position ${eofPositionAt(input, cursor.index)}`
    );
  const comma = input.index.firstTopLevelComma(start, close);
  const property = customProperty(tokens, start, comma === -1 ? close : comma);
  if (!property)
    throw new Error(
      `Invalid custom property in ${name}() at position ${tokens[start]?.[2] ?? eofPositionAt(input, cursor.index)}`
    );
  cursor.skipTo(close + 1);
  /** @type {OpaqueComponent[]} */
  const components = [
    ident(property.decoded, sourceSpelling(property.raw, property.decoded)),
  ];
  if (comma !== -1)
    components.push(...componentTree(input, property.index + 1, close));
  return opaqueCall(name, components, sourceSpelling(rawName, name));
}

/** @type {Record<string, {lbp: number}>} */
const INFIX = {
  '+': { lbp: ADD_BP },
  '-': { lbp: ADD_BP },
  '*': { lbp: MUL_BP },
  '/': { lbp: MUL_BP },
};

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
