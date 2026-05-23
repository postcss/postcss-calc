// Unit tests for parser.ts — parselet behavior and raw AST shape.
// Distinct from test-simplify: we assert what the PARSER produces,
// before simplify runs. Uses sexpr for compact structural assertions.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tokenize } from '../../src/core/tokenizer.ts';
import { parse, Parser, defaultPrefix, defaultInfix } from '../../src/core/parser.ts';
import { sexpr } from '../helpers/sexpr.ts';

/** Parse input, return its S-expression. */
const ast = (input: string): string => sexpr(parse(tokenize(input)));

// --- Literal parselets ----------------------------------------------------

test('parser: bare number', () => {
  assert.equal(ast('42'), '42');
});

test('parser: bare dimension', () => {
  assert.equal(ast('10px'), '10px');
});

test('parser: bare ident', () => {
  assert.equal(ast('foo'), 'foo');
});

test('parser: unit-case normalization happens at parse', () => {
  // Tokenizer stores `PX` verbatim; the dimension parselet lowercases.
  assert.equal(ast('1PX'), '1px');
});

test('parser: % is preserved as a unit', () => {
  assert.equal(ast('50%'), '50%');
});

// --- Precedence and associativity ----------------------------------------

test('parser: * binds tighter than +', () => {
  assert.equal(ast('1 + 2 * 3'), '(+ 1 (* 2 3))');
});

test('parser: / binds tighter than +', () => {
  assert.equal(ast('1 + 6 / 2'), '(+ 1 (* 6 (/ 2)))');
});

test('parser: left-associative +', () => {
  // n-ary Sum: three sibling terms, not nested binaries.
  assert.equal(ast('1 + 2 + 3'), '(+ 1 2 3)');
});

test('parser: left-associative -', () => {
  // mkSum normalizes {-1, Num(2)} → {+1, Num(-2)}, so sexpr shows `-2`
  // directly rather than the (- 2) opaque form.
  assert.equal(ast('1 - 2 - 3'), '(+ 1 -2 -3)');
});

test('parser: left-associative *', () => {
  assert.equal(ast('2 * 3 * 4'), '(* 2 3 4)');
});

test('parser: mixed + / - flattens to one Sum', () => {
  assert.equal(ast('1 - 2 + 3'), '(+ 1 -2 3)');
});

// --- Unary + / - prefix ---------------------------------------------------

test('parser: unary - on Num absorbs into value', () => {
  assert.equal(ast('-5'), '-5');
});

test('parser: unary - on Dim absorbs into value', () => {
  assert.equal(ast('-10px'), '-10px');
});

test('parser: double unary - cancels', () => {
  // Bare `--5` tokenizes as a single ident per CSS Syntax L3 (leading
  // `-` followed by `-` starts an ident), so use a grouped form to
  // exercise two unary-minus parses.
  assert.equal(ast('-(-5)'), '5');
});

test('parser: unary + is a no-op', () => {
  assert.equal(ast('+5'), '5');
});

test('parser: unary - on opaque wraps in single-term negative Sum', () => {
  // `-x` tokenizes as one ident per CSS Syntax L3. Parenthesize so the
  // leading `-` lives next to a `(` and stays a punctuator.
  assert.equal(ast('-(x)'), '(+ (- x))');
});

// --- Grouping -------------------------------------------------------------

test('parser: parens override precedence', () => {
  assert.equal(ast('(1 + 2) * 3'), '(* (+ 1 2) 3)');
});

test('parser: nested parens collapse to a single value', () => {
  assert.equal(ast('(((42)))'), '42');
});

// --- Function calls -------------------------------------------------------

test('parser: zero-arg call', () => {
  assert.equal(ast('pi()'), '(pi)');
});

test('parser: multi-arg call', () => {
  assert.equal(ast('clamp(0, 5, 10)'), '(clamp 0 5 10)');
});

test('parser: call args use full precedence (no escape)', () => {
  assert.equal(ast('min(1 + 2, 3 * 4)'), '(min (+ 1 2) (* 3 4))');
});

test('parser: var() preserves custom-property idents', () => {
  assert.equal(ast('var(--x)'), '(var --x)');
});

test('parser: calc() wraps its single argument as a Call', () => {
  assert.equal(ast('calc(1 + 2)'), '(calc (+ 1 2))');
});

// --- §10.5 exponential function calls round-trip as opaque -------------

test('parser: pow(2, 3) parses as Call with two args', () => {
  assert.equal(ast('pow(2, 3)'), '(pow 2 3)');
});

test('parser: sqrt(4) parses as Call with one arg', () => {
  assert.equal(ast('sqrt(4)'), '(sqrt 4)');
});

test('parser: hypot accepts variable arity', () => {
  assert.equal(ast('hypot(3, 4)'), '(hypot 3 4)');
  assert.equal(ast('hypot(1, 2, 3)'), '(hypot 1 2 3)');
});

test('parser: log accepts one or two args', () => {
  assert.equal(ast('log(8, 2)'), '(log 8 2)');
  assert.equal(ast('log(8)'), '(log 8)');
});

test('parser: exp(1) parses as Call', () => {
  assert.equal(ast('exp(1)'), '(exp 1)');
});

// --- Opaque-arg functions: anchor() / anchor-size() ---------------------
//
// CSS Anchor Positioning takes space-separated `<anchor-name> <anchor-side>`
// arguments instead of comma-separated calc expressions. The parser slurps
// them as raw text so they round-trip unchanged through simplify+serialize.

test('parser: anchor() with `<name> <side>` parses as opaque single arg', () => {
  assert.equal(ast('anchor(--foo top)'), '(anchor --foo top)');
});

test('parser: anchor() with `implicit <side>` keyword name', () => {
  assert.equal(ast('anchor(implicit bottom)'), '(anchor implicit bottom)');
});

test('parser: anchor() with comma-separated fallback', () => {
  assert.equal(ast('anchor(--foo top, 50px)'), '(anchor --foo top 50px)');
});

test('parser: anchor-size() also takes space-separated args', () => {
  assert.equal(ast('anchor-size(--foo height)'), '(anchor-size --foo height)');
});

test('parser: anchor() composes inside calc() arithmetic', () => {
  // Sum canonicalization pushes the negative sign into the term, so
  // `x - 42px` arrives as `+ (anchor) + -42px` in raw AST form.
  assert.equal(
    ast('calc(anchor(--foo top) - 42px)'),
    '(calc (+ (anchor --foo top) -42px))'
  );
});

test('parser: anchor() with single side keyword', () => {
  assert.equal(ast('anchor(top)'), '(anchor top)');
});

test('parser: unclosed anchor() throws', () => {
  assert.throws(
    () => parse(tokenize('anchor(--foo top')),
    /Unclosed anchor\(/
  );
});

// --- Calc-keyword folding -------------------------------------------------

test('parser: `pi` folds to Math.PI', () => {
  assert.equal(ast('pi'), String(Math.PI));
});

test('parser: `e` folds to Math.E', () => {
  assert.equal(ast('e'), String(Math.E));
});

test('parser: `infinity` folds to Infinity', () => {
  assert.equal(ast('infinity'), 'Infinity');
});

test('parser: calc-keywords are case-insensitive except NaN', () => {
  assert.equal(ast('PI'), String(Math.PI));
  assert.equal(ast('Infinity'), 'Infinity');
});

test('parser: lowercase `nan` is NOT the keyword (case-sensitive)', () => {
  // Spec: `NaN` is the only case-sensitive calc keyword. `nan` as
  // lowercase is just an opaque identifier.
  assert.equal(ast('nan'), 'nan');
});

// --- Strict whitespace around +/- ----------------------------------------

test('parser: `1px + 2px` is valid', () => {
  assert.doesNotThrow(() => parse(tokenize('1px + 2px')));
});

// §10.1: `+` and `-` must be surrounded by whitespace. All three asymmetric
// cases (no/before-only/after-only) must throw the same way.
for (const input of ['1px+2px', '1px +2px', '1px+ 2px']) {
  test(`parser: \`${input}\` throws (asymmetric whitespace around +)`, () => {
    assert.throws(
      () => parse(tokenize(input)),
      /must be surrounded by whitespace/
    );
  });
}

test('parser: * / do not require whitespace (spec allows both)', () => {
  assert.doesNotThrow(() => parse(tokenize('1px*2')));
  assert.doesNotThrow(() => parse(tokenize('1px/2')));
});

test('parser: tab / newline satisfy the §10.1 whitespace rule', () => {
  // The whitespace check inspects the token's `ws` flag, which the
  // tokenizer sets for any character matched by /\s/ — tab and newline
  // count just like a space. (sexpr shows the raw parse, no folding.)
  assert.equal(ast('1\t+\n2'), '(+ 1 2)');
  assert.equal(ast('1\n-\t2'), '(+ 1 -2)');
});

// --- Error positions ------------------------------------------------------

test('parser: trailing operator throws (whitespace-before-EOF fails)', () => {
  // `1 +` has space before `+` but nothing after — EOF has ws=false, so
  // the strict-whitespace check fires before the unexpected-token path.
  assert.throws(
    () => parse(tokenize('1 +')),
    /must be surrounded by whitespace|Unexpected token/
  );
});

test('parser: unclosed paren expects )', () => {
  assert.throws(() => parse(tokenize('(1 + 2')), /Expected/);
});

test('parser: stacked operators throw', () => {
  assert.throws(() => parse(tokenize('1 * * 2')), /Unexpected token/);
});

// --- Parser class directly ------------------------------------------------

test('Parser: peek and next advance the cursor', () => {
  const p = new Parser(tokenize('1 + 2'), defaultPrefix(), defaultInfix());
  const first = p.peek();
  assert.equal(first.value, '1');
  p.next();
  assert.equal(p.peek().value, '+');
});

test('Parser: expect() consumes a matching token', () => {
  const p = new Parser(tokenize('1 + 2'), defaultPrefix(), defaultInfix());
  p.next(); // consume 1
  const t = p.expect('punct', '+');
  assert.equal(t.value, '+');
});

test('Parser: expect() throws with position on mismatch', () => {
  const p = new Parser(tokenize('1 + 2'), defaultPrefix(), defaultInfix());
  p.next(); // consume 1
  assert.throws(() => p.expect('punct', '*'), /Expected \*/);
});

test('Parser: parseExpr returns a Node', () => {
  const p = new Parser(tokenize('1 + 2'), defaultPrefix(), defaultInfix());
  const n = p.parseExpr();
  assert.equal((n as { type: 'Sum' }).type, 'Sum');
});

// --- Trailing tokens ------------------------------------------------------

test('parse: rejects input with trailing tokens after a complete expression', () => {
  assert.throws(() => parse(tokenize('1 2')), /Unexpected token/);
});

test('parse: empty input throws', () => {
  assert.throws(() => parse(tokenize('')), /Unexpected token/);
});
