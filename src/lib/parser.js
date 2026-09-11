// Pratt parser over native @csstools/css-tokenizer tokens.
import { TokenType as CssType } from '@csstools/css-tokenizer';
import { baseOf } from './convertUnits.js';
import { mkSum, mkProduct, negate, num, dim, ident, call } from './node.js';
import { setComponents } from './opaque.js';
import { isSupportedMathFunction } from './simplify/call.js';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('./node.js').Node} Node */
/** @typedef {string | Node | Component[]} Component */
/**
 * @typedef {object} Token
 * @property {'number' | 'dimension' | 'ident' | 'function' | 'punct' | 'eof'} type
 * @property {string | number} value
 * @property {string} raw
 * @property {string} [unit]
 * @property {string} [rawUnit]
 * @property {'+' | '-'} [signCharacter]
 * @property {number} pos
 * @property {boolean} ws
 * @property {string} leadingRaw
 * @property {CSSToken} [native]
 */
/** @typedef {(p: Parser, token: Token) => Node} PrefixParselet */

const NUMERIC_RAW = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/;
const PUNCT_DELIMS = new Set(['+', '-', '*', '/']);
const BLOCK_CLOSE = new Map([
  [CssType.Function, CssType.CloseParen],
  [CssType.OpenParen, CssType.CloseParen],
  [CssType.OpenSquare, CssType.CloseSquare],
  [CssType.OpenCurly, CssType.CloseCurly],
]);
/** @param {string} raw @param {string} decoded */
function sourceSpelling(raw, decoded) {
  return raw === decoded ? undefined : raw;
}

/** Bounded cursor that skips trivia but records whether it preceded a token. */
class Parser {
  /** @type {CSSToken[]} */
  #tokens;
  /** @type {number} */
  #end;
  /** @type {Map<number, number>} */
  #ends;
  /** @type {number} */
  #i;
  /** @type {boolean} */
  #precededByWhitespace = true;
  /** @type {Token | null} */
  #lookahead = null;

  /**
   * @param {CSSToken[]} tokens
   * @param {number} start
   * @param {number} end
   * @param {Map<number, number>} [ends]
   */
  constructor(tokens, start, end, ends = blockEnds(tokens, start, end)) {
    this.#tokens = tokens;
    this.#end = end;
    this.#ends = ends;
    this.#i = start;
    this.#precededByWhitespace = true;
    this.#lookahead = null;
  }

  /** @return {Map<number, number>} */
  get ends() {
    return this.#ends;
  }

  /** @return {number} */
  eofPosition() {
    if (this.#i < this.#end && this.#tokens[this.#i][0] !== CssType.EOF) {
      return this.#tokens[this.#i][2];
    }
    if (
      this.#end < this.#tokens.length &&
      this.#tokens[this.#end][0] !== CssType.EOF
    ) {
      return this.#tokens[this.#end][2];
    }
    for (let i = Math.min(this.#end, this.#tokens.length) - 1; i >= 0; i--) {
      const token = this.#tokens[i];
      if (token[0] !== CssType.EOF) return token[3] + 1;
    }
    return 0;
  }

  /** @return {Token} */
  read() {
    let leadingRaw = '';
    while (this.#i < this.#end) {
      const native = this.#tokens[this.#i++];
      if (native[0] === CssType.Whitespace || native[0] === CssType.Comment) {
        this.#precededByWhitespace = true;
        leadingRaw += native[1];
        continue;
      }
      if (native[0] === CssType.EOF) break;
      const ws = this.#precededByWhitespace;
      this.#precededByWhitespace = false;
      return normalizeToken(native, ws, leadingRaw);
    }
    return {
      type: 'eof',
      value: '',
      raw: '',
      pos: this.eofPosition(),
      ws: this.#precededByWhitespace,
      leadingRaw,
    };
  }

  /** @return {Token} */
  peek() {
    if (this.#lookahead === null) this.#lookahead = this.read();
    return this.#lookahead;
  }

  /** @return {Token} */
  next() {
    const token = this.peek();
    this.#lookahead = null;
    return token;
  }

  /** @return {{start: number, close: number, tokens: CSSToken[], ends: Map<number, number>}} */
  functionRange() {
    return {
      start: this.#i,
      close: this.#ends.get(this.#i - 1) ?? -1,
      tokens: this.#tokens,
      ends: this.#ends,
    };
  }

  /** @param {number} index */
  consumeThrough(index) {
    this.#i = index;
    this.#lookahead = null;
  }

  /** @param {string} value @param {string} [value2] @return {boolean} */
  isPunct(value, value2) {
    const t = this.peek();
    return (
      t.type === 'punct' &&
      (t.value === value || (value2 !== undefined && t.value === value2))
    );
  }

  /** @param {string} value @return {boolean} */
  matchPunct(value) {
    if (!this.isPunct(value)) return false;
    this.next();
    return true;
  }

  /** @param {string} value @return {Token} */
  expectPunct(value) {
    const t = this.next();
    if (t.type !== 'punct' || t.value !== value) {
      throw new Error(
        `Expected ${value} at position ${t.pos}, got "${t.value}"`
      );
    }
    return t;
  }

  /** @param {number} [minBp] @return {Node} */
  parseExpr(minBp = 0) {
    const t = this.next();
    const key = t.type === 'punct' ? String(t.value) : t.type;
    const prefix = PREFIX[key];
    if (!prefix)
      throw new Error(`Unexpected token "${t.raw}" at position ${t.pos}`);
    let left = prefix(this, t);

    while (true) {
      const nxt = this.peek();
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
          const token = this.next();
          requireSurroundingWs(this, token);
          terms.push({
            sign: /** @type {1 | -1} */ (token.value === '+' ? 1 : -1),
            node: this.parseExpr(ADD_BP + 1),
          });
        } while (this.isPunct('+', '-'));
        left = mkSum(terms);
        continue;
      }
      if (infixKey === '*' || infixKey === '/') {
        /** @type {import('./node.js').ProductFactor[]} */
        const factors = [{ exponent: /** @type {1} */ (1), node: left }];
        do {
          const token = this.next();
          factors.push({
            exponent: /** @type {1 | -1} */ (token.value === '*' ? 1 : -1),
            node: this.parseExpr(MUL_BP + 1),
          });
        } while (this.isPunct('*', '/'));
        left = mkProduct(factors);
        continue;
      }
      break;
    }
    return left;
  }
}

/** @param {CSSToken} t @param {boolean} ws @param {string} leadingRaw @return {Token} */
function normalizeToken(t, ws, leadingRaw) {
  const common = { raw: t[1], pos: t[2], ws, leadingRaw, native: t };
  switch (t[0]) {
    case CssType.Number:
      return {
        ...common,
        type: 'number',
        value: t[4].value,
        signCharacter: t[4].signCharacter,
      };
    case CssType.Dimension: {
      const match = NUMERIC_RAW.exec(t[1]);
      return {
        ...common,
        type: 'dimension',
        value: t[4].value,
        unit: t[4].unit,
        rawUnit: match ? t[1].slice(match[0].length) : t[4].unit,
        signCharacter: t[4].signCharacter,
      };
    }
    case CssType.Percentage:
      return {
        ...common,
        type: 'dimension',
        value: t[4].value,
        unit: '%',
        rawUnit: '%',
        signCharacter: t[4].signCharacter,
      };
    case CssType.Ident:
      return { ...common, type: 'ident', value: t[4].value };
    case CssType.Function:
      return { ...common, type: 'function', value: t[4].value };
    case CssType.OpenParen:
      return { ...common, type: 'punct', value: '(' };
    case CssType.CloseParen:
      return { ...common, type: 'punct', value: ')' };
    case CssType.Comma:
      return { ...common, type: 'punct', value: ',' };
    case CssType.Delim:
      if (PUNCT_DELIMS.has(t[4].value))
        return { ...common, type: 'punct', value: t[4].value };
  }
  throw new Error(
    `Unexpected character "${t[1][0] ?? ''}" at position ${t[2]}`
  );
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
const OPAQUE_ARG_FUNCTIONS = new Set(['anchor', 'anchor-size']);

/** @param {Parser} p @param {string} name @param {string} rawName @return {Node} */
function parseOpaqueCall(p, name, rawName) {
  /** @type {Node[]} */ const args = [];
  /** @type {Token[]} */ let tokens = [];
  let depth = 1;
  const flush = () => {
    if (tokens.length) {
      const raw = tokens
        .map((t, i) => `${i === 0 ? '' : t.leadingRaw}${t.raw}`)
        .join('');
      const decoded = tokens
        .map(
          (t, i) =>
            `${i > 0 && t.ws ? ' ' : ''}${decodedTokenText(/** @type {CSSToken} */ (t.native))}`
        )
        .join('');
      args.push(ident(decoded, sourceSpelling(raw, decoded)));
    }
    tokens = [];
  };
  while (true) {
    const tk = p.peek();
    if (tk.type === 'eof')
      throw new Error(`Unclosed ${name}( at position ${tk.pos}`);
    const native = /** @type {CSSToken} */ (tk.native);
    if (native[0] === CssType.Function || native[0] === CssType.OpenParen)
      depth++;
    else if (native[0] === CssType.CloseParen) {
      depth--;
      if (depth === 0) {
        p.next();
        flush();
        return call(name, args, sourceSpelling(rawName, name));
      }
    } else if (native[0] === CssType.Comma && depth === 1) {
      p.next();
      flush();
      continue;
    }
    tokens.push(tk);
    p.next();
  }
}

/** @param {CSSToken} t @return {string} */
function decodedTokenText(t) {
  if (t[0] === CssType.Ident) return t[4].value;
  if (t[0] === CssType.Function) return `${t[4].value}(`;
  if (t[0] === CssType.Dimension) return `${t[4].value}${t[4].unit}`;
  if (t[0] === CssType.Number) return String(t[4].value);
  if (t[0] === CssType.Percentage) return `${t[4].value}%`;
  return t[1];
}

/** @param {Parser} p @param {Token} token */
function requireSurroundingWs(p, token) {
  if (!token.ws || !p.peek().ws)
    throw new Error(
      `"${token.value}" must be surrounded by whitespace at position ${token.pos}`
    );
}

/** @param {Parser} p @param {Token} t @return {Node} */
function parseCall(p, t) {
  const name = String(t.value);
  const rawName = t.raw.slice(0, -1);
  if (name.toLowerCase() === 'var') return parseVar(p, name, rawName);
  if (OPAQUE_ARG_FUNCTIONS.has(name.toLowerCase()))
    return parseOpaqueCall(p, name, rawName);
  /** @type {Node[]} */ const args = [];
  if (!p.isPunct(')')) {
    args.push(p.parseExpr(0));
    while (p.matchPunct(',')) args.push(p.parseExpr(0));
  }
  p.expectPunct(')');
  return call(name, args, sourceSpelling(rawName, name));
}

/** @param {CSSToken[]} tokens @param {number} start @param {number} end */
function rawTokens(tokens, start, end) {
  let raw = '';
  for (let i = start; i < end; i++) raw += tokens[i][1];
  return raw;
}
/** @param {CSSToken[]} tokens @param {number} start @param {number} end @param {Map<number, number>} ends @return {number} */
function firstComma(tokens, start, end, ends) {
  for (let i = start; i < end; i++) {
    const close = ends.get(i);
    if (close !== undefined) {
      i = close;
      continue;
    }
    if (tokens[i][0] === CssType.Comma) return i;
  }
  return -1;
}
/** @param {CSSToken[]} tokens @param {number} start @param {number} end */
function blockEnds(tokens, start, end) {
  /** @type {{index: number, close: import('@csstools/css-tokenizer').TokenType}[]} */
  const stack = [];
  /** @type {Map<number, number>} */ const ends = new Map();
  for (let i = start; i < end; i++) {
    const close = BLOCK_CLOSE.get(tokens[i][0]);
    if (close !== undefined) {
      stack.push({ index: i, close });
      continue;
    }
    const open = stack.at(-1);
    if (open !== undefined && tokens[i][0] === open.close) {
      stack.pop();
      ends.set(open.index, i);
    }
  }
  return ends;
}
/** @param {CSSToken[]} tokens @param {number} start @param {number} end */
function customProperty(tokens, start, end) {
  /** @type {{token: CSSToken, index: number}[]} */
  const meaningful = [];
  for (let i = start; i < end; i++)
    if (tokens[i][0] !== CssType.Whitespace && tokens[i][0] !== CssType.Comment)
      meaningful.push({ token: tokens[i], index: i });
  if (meaningful.length !== 1 || meaningful[0].token[0] !== CssType.Ident)
    return null;
  const { token, index } = meaningful[0];
  const decoded = token[4].value;
  return decoded.startsWith('--') && decoded !== '--'
    ? { decoded, raw: token[1], index }
    : null;
}
/** @param {CSSToken[]} tokens @param {number} start @param {number} end @param {Map<number, number>} ends @return {Component[]} */
function componentTree(tokens, start, end, ends) {
  /** @type {Component[]} */ const tree = [];
  /** @param {Component} part */
  const push = (part) => {
    if (typeof part === 'string' && typeof tree.at(-1) === 'string')
      tree[tree.length - 1] += part;
    else tree.push(part);
  };
  for (let i = start; i < end; i++) {
    const token = tokens[i];
    const close = ends.get(i) ?? -1;
    if (close === -1) {
      push(token[1]);
      continue;
    }
    if (token[0] === CssType.Function) {
      const name = token[4].value;
      const supported =
        /^(?:-(?:moz|webkit)-)?calc$/i.test(name) ||
        isSupportedMathFunction(name);
      if (supported) {
        try {
          push(parseRange(tokens, i, close + 1, ends));
        } catch {
          push(rawTokens(tokens, i, close + 1));
        }
      } else {
        push(token[1]);
        push(componentTree(tokens, i + 1, close, ends));
        push(tokens[close][1]);
      }
    } else {
      push(token[1]);
      push(componentTree(tokens, i + 1, close, ends));
      push(tokens[close][1]);
    }
    i = close;
  }
  return tree;
}
/** @param {Parser} p @param {string} name @param {string} rawName @return {Node} */
function parseVar(p, name, rawName) {
  const { start, close, tokens, ends } = p.functionRange();
  if (close === -1)
    throw new Error(`Unclosed ${name}( at position ${p.eofPosition()}`);
  const comma = firstComma(tokens, start, close, ends);
  const property = customProperty(tokens, start, comma === -1 ? close : comma);
  if (!property)
    throw new Error(
      `Invalid custom property in ${name}() at position ${tokens[start]?.[2] ?? p.eofPosition()}`
    );
  p.consumeThrough(close + 1);
  const node = call(
    name,
    [ident(property.decoded, sourceSpelling(property.raw, property.decoded))],
    sourceSpelling(rawName, name)
  );
  if (comma !== -1)
    setComponents(node, componentTree(tokens, property.index + 1, close, ends));
  return node;
}

/** @type {Record<string, PrefixParselet>} */
const PREFIX = {
  number: (_p, t) => num(/** @type {number} */ (t.value)),
  dimension: (_p, t) => {
    const unit = /** @type {string} */ (t.unit).toLowerCase();
    return dim(
      /** @type {number} */ (t.value),
      unit,
      baseOf(unit) || t.rawUnit === unit ? undefined : t.rawUnit
    );
  },
  ident: (_p, t) => {
    const name = String(t.value);
    return foldCalcKeyword(name) ?? ident(name, sourceSpelling(t.raw, name));
  },
  function: parseCall,
  '(': (p) => {
    const e = p.parseExpr(0);
    p.expectPunct(')');
    return e.type === 'Sum' ? { ...e, grouped: true } : e;
  },
  '-': (p) => negate(p.parseExpr(7)),
  '+': (p) => p.parseExpr(7),
};

/** @type {Record<string, {lbp: number}>} */
const INFIX = {
  '+': { lbp: ADD_BP },
  '-': { lbp: ADD_BP },
  '*': { lbp: MUL_BP },
  '/': { lbp: MUL_BP },
};

/**
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @param {Map<number, number>} ends
 * @return {Node}
 */
function parseRange(tokens, start, end, ends) {
  const p = new Parser(tokens, start, end, ends);
  const ast = p.parseExpr(0);
  const trailing = p.peek();
  if (trailing.type !== 'eof')
    throw new Error(
      `Unexpected token "${trailing.raw}" at position ${trailing.pos}`
    );
  return ast;
}

/** @param {CSSToken[]} tokens @param {number} [start] @param {number} [end] @return {Node} */
function parse(tokens, start = 0, end = tokens.length) {
  const ends = blockEnds(tokens, start, end);
  return parseRange(tokens, start, end, ends);
}

export { parse };
