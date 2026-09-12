// Unit tests for parser.ts — parselet behavior and raw AST shape.
// Distinct from test-simplify: we assert what the PARSER produces,
// before simplify runs. Uses sexpr for compact structural assertions.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/lib/tokenizer.js';
import { parse } from '../../src/lib/parser.js';
import { serialize } from '../../src/lib/serialize.js';
import { sexpr } from '../helpers/sexpr.js';

/** Parse input, return its S-expression. */
const ast = (input) => sexpr(parse(tokenize(input)));
// --- Opaque non-math functions -------------------------------------------
//
// Non-math functions use CSS component-value syntax rather than the math
// grammar. Keeping all of them opaque avoids a name allowlist that must be
// updated for every future CSS function.
describe('parser: Anchor', () => {
  test('parser: anchor() with `<name> <side>` parses as opaque single arg', () => {
    assert.equal(
      serialize(parse(tokenize('anchor(--foo top)'))),
      'anchor(--foo top)'
    );
  });

  test('parser: anchor() with `implicit <side>` keyword name', () => {
    assert.equal(
      serialize(parse(tokenize('anchor(implicit bottom)'))),
      'anchor(implicit bottom)'
    );
  });

  test('parser: anchor() with comma-separated fallback', () => {
    assert.equal(
      serialize(parse(tokenize('anchor(--foo top, 50px)'))),
      'anchor(--foo top, 50px)'
    );
  });

  test('parser: anchor-size() also takes space-separated args', () => {
    assert.equal(
      serialize(parse(tokenize('anchor-size(--foo height)'))),
      'anchor-size(--foo height)'
    );
  });

  test('parser: anchor() composes inside calc() arithmetic', () => {
    assert.equal(
      serialize(parse(tokenize('calc(anchor(--foo top) - 42px)'))),
      'calc(anchor(--foo top) - 42px)'
    );
  });

  test('parser: anchor() with single side keyword', () => {
    assert.equal(serialize(parse(tokenize('anchor(top)'))), 'anchor(top)');
  });

  test('parser: anchor arguments preserve escaped lexical spelling', () => {
    const input = String.raw`anchor(--x\ top left)`;
    assert.equal(serialize(parse(tokenize(input))), input);
  });

  test('parser: arbitrary non-math function contents stay opaque', () => {
    for (const input of [
      'attr(size ch)',
      'future-fn("x", [a b] {c: #fff})',
      'unknown(1px + 2px)',
    ]) {
      assert.equal(serialize(parse(tokenize(input))), input);
    }
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
  test('parser: comments satisfy the §10.1 whitespace rule', () => {
    assert.equal(ast('1px/* gap */+/* gap */2px'), '(+ 1px 2px)');
    assert.equal(ast('/* gap */1px + 2px'), '(+ 1px 2px)');
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
  // --- expect() failures (unclosed groups) -----------------------------------
  test('parser: unclosed paren throws with expected-token message', () => {
    assert.throws(() => parse(tokenize('(1 + 2')), /Expected \)/);
  });

  test('parser: unclosed call throws with expected-token message', () => {
    assert.throws(() => parse(tokenize('min(1, 2')), /Expected \)/);
  });

  test('parser: unclosed var throws with unclosed message and position', () => {
    assert.throws(
      () => parse(tokenize('var(--foo')),
      /Unclosed var\( at position 4/
    );
  });
  // --- Trailing tokens ------------------------------------------------------
  test('parse: rejects input with trailing tokens after a complete expression', () => {
    assert.throws(() => parse(tokenize('1 2')), /Unexpected token/);
  });
  test('parse: empty input throws', () => {
    assert.throws(() => parse(tokenize('')), /Unexpected token/);
  });

  test('parser: punctuation helper methods match and expect punctuation tokens', () => {
    assert.equal(ast('1 + 2 + 3 + 4'), '(+ 1 2 3 4)');
    assert.equal(ast('2 * 3 * 4 * 5'), '(* 2 3 4 5)');
    assert.equal(ast('min(1, 2, 3)'), '(min 1 2 3)');
  });
});
