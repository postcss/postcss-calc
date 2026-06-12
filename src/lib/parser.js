'use strict';

// Pratt parser. +/- emit Sum nodes; */÷ emit Product nodes. node.js
// constructors flatten and normalize on construction, so the parser
// never produces a Binary node.

const { mkSum, mkProduct, negate } = require('./node.js');

/**
 * @typedef {import('./tokenizer.js').Token} Token
 * @typedef {import('./tokenizer.js').TokenType} TokenType
 * @typedef {import('./node.js').Node} Node
 * @typedef {(p: Parser, token: Token) => Node} PrefixParselet
 * @typedef {{lbp: number, parse: (p: Parser, left: Node, token: Token) => Node}} InfixParselet
 */

/**
 * @param {Token} t
 * @param {string} value
 * @return {boolean}
 */
function isPunct(t, value) {
  return t.type === 'punct' && t.value === value;
}

/**
 * §10.9 — case-insensitive except for NaN.
 * @param {string} name
 * @return {Node | null}
 */
function foldCalcKeyword(name) {
  // `NaN` and `-NaN` are spec-defined math constants (§10.7.1). The signed
  // form arrives as a single ident because CSS Syntax tokenizes leading
  // `-` + ident-start as one ident-token.
  if (name === 'NaN' || name === '-NaN') {
    return { type: 'Num', value: NaN };
  }
  switch (name.toLowerCase()) {
    case 'pi':
      return { type: 'Num', value: Math.PI };
    case 'e':
      return { type: 'Num', value: Math.E };
    case 'infinity':
      return { type: 'Num', value: Infinity };
    case '-infinity':
      return { type: 'Num', value: -Infinity };
  }
  return null;
}

class Parser {
  /**
   * @param {Token[]} tokens
   */
  constructor(tokens) {
    /** @private */
    this.i = 0;
    /** @private @readonly */
    this.tokens = tokens;
  }

  /** @return {Token} */
  peek() {
    return this.tokens[this.i];
  }

  /** @return {Token} */
  next() {
    return this.tokens[this.i++];
  }

  /**
   * @param {TokenType} type
   * @param {string} [value]
   * @return {Token}
   */
  expect(type, value) {
    const t = this.next();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      const want = value ?? type;
      throw new Error(
        `Expected ${want} at position ${t.pos}, got "${t.value}"`
      );
    }
    return t;
  }

  /**
   * @param {number} [minBp]
   * @return {Node}
   */
  parseExpr(minBp = 0) {
    const t = this.next();
    const key = t.type === 'punct' ? t.value : t.type;
    const prefix = PREFIX[key];
    if (!prefix) {
      throw new Error(`Unexpected token "${t.value}" at position ${t.pos}`);
    }
    let left = prefix(this, t);

    while (true) {
      const nxt = this.peek();
      const infixKey = nxt.type === 'punct' ? nxt.value : nxt.type;
      const rule = INFIX[infixKey];
      if (!rule || rule.lbp < minBp) {
        break;
      }
      this.next();
      left = rule.parse(this, left, nxt);
    }

    return left;
  }
}

/**
 * @param {Node} left
 * @param {Node} right
 * @param {1 | -1} rightSign
 * @return {Node}
 */
function addTerm(left, right, rightSign) {
  return mkSum([
    { sign: 1, node: left },
    { sign: rightSign, node: right },
  ]);
}

/**
 * @param {Node} left
 * @param {Node} right
 * @param {1 | -1} rightExp
 * @return {Node}
 */
function mulFactor(left, right, rightExp) {
  return mkProduct([
    { exponent: 1, node: left },
    { exponent: rightExp, node: right },
  ]);
}

const ADD_BP = 1;
const MUL_BP = 3;
const UNARY_BP = 7;

/**
 * Functions whose argument list isn't a comma-separated list of calc
 * expressions. Their bodies are slurped as opaque space-separated tokens
 * and round-tripped verbatim. anchor() / anchor-size() use the
 * `<anchor-name> <anchor-side>` shape (CSS Anchor Positioning).
 */
const OPAQUE_ARG_FUNCTIONS = new Set(['anchor', 'anchor-size']);

/**
 * Reconstruct a token's source text for opaque-arg slurping.
 * @param {Token} t
 * @return {string}
 */
function tokenText(t) {
  if (t.type === 'dimension') {return `${t.value}${t.unit ?? ''}`;}
  return t.value;
}

/**
 * Parse the body of an opaque-arg call, with `(` already consumed.
 * @param {Parser} p
 * @param {string} name
 * @return {Node}
 */
function parseOpaqueCall(p, name) {
  /** @type {Node[]} */
  const args = [];
  let buf = '';
  let depth = 1;
  const flush = () => {
    const trimmed = buf.trim();
    if (trimmed) {args.push({ type: 'Ident', name: trimmed });}
    buf = '';
  };
  while (true) {
    const tk = p.peek();
    if (tk.type === 'eof') {
      throw new Error(`Unclosed ${name}( at position ${tk.pos}`);
    }
    if (tk.type === 'punct') {
      if (tk.value === '(') {depth++;}
      else if (tk.value === ')') {
        depth--;
        if (depth === 0) {
          p.next();
          flush();
          return { type: 'Call', name, args };
        }
      } else if (tk.value === ',' && depth === 1) {
        p.next();
        flush();
        continue;
      }
    }
    if (tk.ws && buf) {buf += ' ';}
    buf += tokenText(tk);
    p.next();
  }
}

/**
 * §10.1 requires whitespace on both sides of a binary `+` / `-`. Without
 * it, CSS tokenization treats `1px+2px` as two tokens with no operator
 * between them (browsers reject this). We enforce the rule here by
 * checking the token's `ws` flag (whitespace before the `+`/`-`) and the
 * following token's flag (whitespace after).
 * @param {Parser} p
 * @param {Token} token
 * @return {void}
 */
function requireSurroundingWs(p, token) {
  const next = p.peek();
  if (!token.ws || !next.ws) {
    throw new Error(
      `"${token.value}" must be surrounded by whitespace at position ${token.pos}`
    );
  }
}

/** @type {Record<string, PrefixParselet>} */
const PREFIX = {
  number: (_p, t) => ({ type: 'Num', value: parseFloat(t.value) }),

  // Unit case normalization per §10.12: `1PX` serializes as `1px`.
  dimension: (_p, t) => ({
    type: 'Dim',
    value: parseFloat(t.value),
    unit: t.unit === '%' ? '%' : /** @type {string} */ (t.unit).toLowerCase(),
  }),

  ident: (p, t) => {
    const nxt = p.peek();
    if (nxt.type === 'punct' && nxt.value === '(') {
      p.next();
      if (OPAQUE_ARG_FUNCTIONS.has(t.value.toLowerCase())) {
        return parseOpaqueCall(p, t.value);
      }
      /** @type {Node[]} */
      const args = [];
      if (!isPunct(p.peek(), ')')) {
        args.push(p.parseExpr(0));
        while (isPunct(p.peek(), ',')) {
          p.next();
          args.push(p.parseExpr(0));
        }
      }
      p.expect('punct', ')');
      return { type: 'Call', name: t.value, args };
    }
    const kw = foldCalcKeyword(t.value);
    if (kw) {
      return kw;
    }
    return { type: 'Ident', name: t.value };
  },

  '(': (p) => {
    const e = p.parseExpr(0);
    p.expect('punct', ')');
    return e;
  },

  '-': (p) => negate(p.parseExpr(UNARY_BP)),
  '+': (p) => p.parseExpr(UNARY_BP),
};

/** @type {Record<string, InfixParselet>} */
const INFIX = {
  '+': {
    lbp: ADD_BP,
    parse: (p, left, token) => {
      requireSurroundingWs(p, token);
      return addTerm(left, p.parseExpr(ADD_BP + 1), 1);
    },
  },
  '-': {
    lbp: ADD_BP,
    parse: (p, left, token) => {
      requireSurroundingWs(p, token);
      return addTerm(left, p.parseExpr(ADD_BP + 1), -1);
    },
  },
  '*': {
    lbp: MUL_BP,
    parse: (p, left) => mulFactor(left, p.parseExpr(MUL_BP + 1), 1),
  },
  '/': {
    lbp: MUL_BP,
    parse: (p, left) => mulFactor(left, p.parseExpr(MUL_BP + 1), -1),
  },
};

/**
 * @param {Token[]} tokens
 * @return {Node}
 */
function parse(tokens) {
  const p = new Parser(tokens);
  const ast = p.parseExpr(0);
  const trailing = p.peek();
  if (trailing.type !== 'eof') {
    throw new Error(
      `Unexpected token "${trailing.value}" at position ${trailing.pos}`
    );
  }
  return ast;
}

module.exports = { parse };
