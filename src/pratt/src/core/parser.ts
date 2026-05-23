// Pratt parser. +/- emit Sum nodes; */÷ emit Product nodes. node.ts
// constructors flatten and normalize on construction, so the parser
// never produces a Binary node.

import type { Token, TokenType } from './tokenizer.ts';
import { mkSum, mkProduct, negate, type Node } from './node.ts';

type PrefixParselet = (p: Parser, token: Token) => Node;

function isPunct(t: Token, value: string): boolean {
  return t.type === 'punct' && t.value === value;
}

interface InfixParselet {
  lbp: number;
  parse: (p: Parser, left: Node, token: Token) => Node;
}

/** §10.9 — case-insensitive except for NaN. */
function foldCalcKeyword(name: string): Node | null {
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

export class Parser {
  private i = 0;

  constructor(
    private readonly tokens: Token[],
    readonly prefix: Record<string, PrefixParselet>,
    readonly infix: Record<string, InfixParselet>
  ) {}

  peek(): Token {
    return this.tokens[this.i]!;
  }

  next(): Token {
    return this.tokens[this.i++]!;
  }

  expect(type: TokenType, value?: string): Token {
    const t = this.next();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      const want = value ?? type;
      throw new Error(
        `Expected ${want} at position ${t.pos}, got "${t.value}"`
      );
    }
    return t;
  }

  parseExpr(minBp = 0): Node {
    const t = this.next();
    const key = t.type === 'punct' ? t.value : t.type;
    const prefix = this.prefix[key];
    if (!prefix) {
      throw new Error(`Unexpected token "${t.value}" at position ${t.pos}`);
    }
    let left = prefix(this, t);

    while (true) {
      const nxt = this.peek();
      const infixKey = nxt.type === 'punct' ? nxt.value : nxt.type;
      const rule = this.infix[infixKey];
      if (!rule || rule.lbp < minBp) {
        break;
      }
      this.next();
      left = rule.parse(this, left, nxt);
    }

    return left;
  }
}

function addTerm(left: Node, right: Node, rightSign: 1 | -1): Node {
  return mkSum([
    { sign: 1, node: left },
    { sign: rightSign, node: right },
  ]);
}

function mulFactor(left: Node, right: Node, rightExp: 1 | -1): Node {
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

/** Reconstruct a token's source text for opaque-arg slurping. */
function tokenText(t: Token): string {
  if (t.type === 'dimension') return `${t.value}${t.unit ?? ''}`;
  return t.value;
}

/** Parse the body of an opaque-arg call, with `(` already consumed. */
function parseOpaqueCall(p: Parser, name: string): Node {
  const args: Node[] = [];
  let buf = '';
  let depth = 1;
  const flush = (): void => {
    const trimmed = buf.trim();
    if (trimmed) args.push({ type: 'Ident', name: trimmed });
    buf = '';
  };
  while (true) {
    const tk = p.peek();
    if (tk.type === 'eof') {
      throw new Error(`Unclosed ${name}( at position ${tk.pos}`);
    }
    if (tk.type === 'punct') {
      if (tk.value === '(') depth++;
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
    if (tk.ws && buf) buf += ' ';
    buf += tokenText(tk);
    p.next();
  }
}

export function defaultPrefix(): Record<string, PrefixParselet> {
  return {
    number: (_p, t) => ({ type: 'Num', value: parseFloat(t.value) }),

    // Unit case normalization per §10.12: `1PX` serializes as `1px`.
    dimension: (_p, t) => ({
      type: 'Dim',
      value: parseFloat(t.value),
      unit: t.unit === '%' ? '%' : t.unit!.toLowerCase(),
    }),

    ident: (p, t) => {
      const nxt = p.peek();
      if (nxt.type === 'punct' && nxt.value === '(') {
        p.next();
        if (OPAQUE_ARG_FUNCTIONS.has(t.value.toLowerCase())) {
          return parseOpaqueCall(p, t.value);
        }
        const args: Node[] = [];
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
}

/**
 * §10.1 requires whitespace on both sides of a binary `+` / `-`. Without
 * it, CSS tokenization treats `1px+2px` as two tokens with no operator
 * between them (browsers reject this). We enforce the rule here by
 * checking the token's `ws` flag (whitespace before the `+`/`-`) and the
 * following token's flag (whitespace after).
 */
function requireSurroundingWs(p: Parser, token: Token): void {
  const next = p.peek();
  if (!token.ws || !next.ws) {
    throw new Error(
      `"${token.value}" must be surrounded by whitespace at position ${token.pos}`
    );
  }
}

export function defaultInfix(): Record<string, InfixParselet> {
  return {
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
}

interface ParseOptions {
  prefix?: Record<string, PrefixParselet>;
  infix?: Record<string, InfixParselet>;
}

export function parse(tokens: Token[], opts: ParseOptions = {}): Node {
  const prefix = opts.prefix ?? defaultPrefix();
  const infix = opts.infix ?? defaultInfix();
  const p = new Parser(tokens, prefix, infix);
  const ast = p.parseExpr(0);
  const trailing = p.peek();
  if (trailing.type !== 'eof') {
    throw new Error(
      `Unexpected token "${trailing.value}" at position ${trailing.pos}`
    );
  }
  return ast;
}
