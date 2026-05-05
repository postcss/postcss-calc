// Unit tests for tokenizer.ts — numbers, dimensions, idents, punct, and
// the `ws` flag that drives strict-whitespace enforcement in the parser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tokenize, type Token } from '../../src/core/tokenizer.ts';

/** Helper: strip trailing EOF for compact assertions. */
function toks(input: string): Array<Omit<Token, 'pos'>> {
  return tokenize(input)
    .filter((t) => t.type !== 'eof')
    .map(({ pos: _pos, ...rest }) => rest);
}

/** Helper: just the values, no metadata. */
function values(input: string): string[] {
  return tokenize(input)
    .filter((t) => t.type !== 'eof')
    .map((t) => (t.type === 'dimension' ? `${t.value}${t.unit}` : t.value));
}

// --- Numbers --------------------------------------------------------------

test('tok: integer', () => {
  assert.deepEqual(values('42'), ['42']);
});

test('tok: float', () => {
  assert.deepEqual(values('3.14'), ['3.14']);
});

test('tok: leading-dot float', () => {
  assert.deepEqual(values('.25'), ['.25']);
});

test('tok: scientific notation', () => {
  assert.deepEqual(values('1e2 1.5e-3 2E+10'), ['1e2', '1.5e-3', '2E+10']);
});

test('tok: `2em` is one dim, not `2e` + `m`', () => {
  // The scientific-notation guard: `e`/`E` only starts an exponent if
  // followed by a digit (optionally after +/-). `2em` should not be
  // misread as number `2e` with unit `m`.
  assert.deepEqual(values('2em'), ['2em']);
  assert.deepEqual(values('3ex'), ['3ex']);
});

test('tok: `4e+2` is a valid scientific number', () => {
  assert.deepEqual(values('4e+2'), ['4e+2']);
});

// --- Dimensions -----------------------------------------------------------

test('tok: percentage is a dimension with unit %', () => {
  const ts = toks('50%');
  assert.equal(ts.length, 1);
  assert.equal(ts[0]!.type, 'dimension');
  assert.equal(ts[0]!.unit, '%');
  assert.equal(ts[0]!.value, '50');
});

test('tok: common length dimensions', () => {
  for (const u of ['px', 'em', 'rem', 'vw', 'vh', 'cqw']) {
    const ts = toks(`10${u}`);
    assert.equal(ts[0]!.type, 'dimension', `${u} should be a dimension`);
    assert.equal(ts[0]!.unit, u);
  }
});

test('tok: `1px-2` is a single dimension with unit `px-2` (§10.1)', () => {
  // CSS ident bodies allow hyphens + digits; the whole run from the first
  // letter to a terminator is the unit.
  const ts = toks('1px-2');
  assert.equal(ts.length, 1);
  assert.equal(ts[0]!.type, 'dimension');
  assert.equal(ts[0]!.unit, 'px-2');
});

test('tok: unit case preserved at the tokenizer level', () => {
  // Normalization to lowercase happens in the parser, not the tokenizer —
  // the tokenizer stores the exact source spelling.
  const ts = toks('20Q');
  assert.equal(ts[0]!.unit, 'Q');
});

// --- Identifiers ----------------------------------------------------------

test('tok: plain ident', () => {
  assert.deepEqual(values('foo'), ['foo']);
});

test('tok: ident body accepts hyphens and digits', () => {
  assert.deepEqual(values('min-content foo-bar_baz'), [
    'min-content',
    'foo-bar_baz',
  ]);
});

test('tok: `--custom-prop` is one ident (CSS custom property)', () => {
  const ts = toks('--my-var');
  assert.equal(ts.length, 1);
  assert.equal(ts[0]!.type, 'ident');
  assert.equal(ts[0]!.value, '--my-var');
});

test('tok: non-ASCII letters are valid name code points (CSS Syntax §4.2)', () => {
  // Greek letters in custom-property names appear in real-world stylesheets.
  assert.deepEqual(values('--φ --πρωτο'), ['--φ', '--πρωτο']);
});

test('tok: non-ASCII letter at the start of a bare ident', () => {
  assert.deepEqual(values('αβγ'), ['αβγ']);
});

test('tok: dimension with non-ASCII unit (treated like any custom unit)', () => {
  assert.deepEqual(values('1ψ'), ['1ψ']);
});

test('tok: `--x` inside var() tokenizes cleanly', () => {
  assert.deepEqual(values('var(--x)'), ['var', '(', '--x', ')']);
});

// --- Punctuation ----------------------------------------------------------

test('tok: all punct characters', () => {
  assert.deepEqual(values('+ - * / ( ) ,'), ['+', '-', '*', '/', '(', ')', ',']);
});

test('tok: no space between number and operator still tokenizes', () => {
  // The tokenizer itself is permissive; the parser enforces §10.1's
  // whitespace-around-+/- rule.
  assert.deepEqual(values('1+2'), ['1', '+', '2']);
});

// --- Whitespace flag ------------------------------------------------------

test('tok: first token is marked ws=true (start-of-input sentinel)', () => {
  assert.equal(tokenize('1')[0]!.ws, true);
});

test('tok: tokens with no preceding whitespace have ws=false', () => {
  const ts = tokenize('1+2');
  // ['1'(ws=true), '+'(ws=false), '2'(ws=false), eof]
  assert.equal(ts[0]!.ws, true);
  assert.equal(ts[1]!.ws, false);
  assert.equal(ts[2]!.ws, false);
});

test('tok: tokens preceded by whitespace have ws=true', () => {
  const ts = tokenize('1 + 2');
  assert.equal(ts[0]!.ws, true); // start
  assert.equal(ts[1]!.ws, true); // after space
  assert.equal(ts[2]!.ws, true); // after space
});

test('tok: any whitespace char (tab, newline) counts', () => {
  const ts = tokenize('1\t+\n2');
  assert.equal(ts[1]!.ws, true);
  assert.equal(ts[2]!.ws, true);
});

test('tok: mixed spacing captured correctly', () => {
  const ts = tokenize('1 +2'); // space before `+`, not after
  assert.equal(ts[1]!.ws, true); // space before +
  assert.equal(ts[2]!.ws, false); // no space before 2
});

test('tok: ws flag is set across multi-character tokens', () => {
  const ts = tokenize('10px 20em');
  assert.equal(ts[0]!.ws, true);
  assert.equal(ts[1]!.ws, true);
});

// --- CSS comments ---------------------------------------------------------

test('tok: /* */ comment is treated as whitespace (skipped)', () => {
  assert.deepEqual(values('1px /* gap */ + 2px'), ['1px', '+', '2px']);
});

test('tok: comment between tokens still sets ws=true on the next token', () => {
  const ts = tokenize('1px/* gap */+ 2px').filter((t) => t.type !== 'eof');
  // Without the comment, `1px+` would parse as adjacent tokens (ws=false).
  // With the comment, the `+` should be marked ws=true so `+` requires
  // surrounding-ws rule is satisfied as far as the tokenizer is concerned.
  assert.equal(ts[1]!.value, '+');
  assert.equal(ts[1]!.ws, true);
});

test('tok: leading comment marks first token ws=true (no surprise)', () => {
  const ts = tokenize('/* hi */1px').filter((t) => t.type !== 'eof');
  assert.equal(ts[0]!.value, '1');
  assert.equal(ts[0]!.ws, true);
});

test('tok: empty comment /**/ is allowed', () => {
  assert.deepEqual(values('1/**/+ 2'), ['1', '+', '2']);
});

test('tok: unterminated comment throws', () => {
  assert.throws(
    () => tokenize('1px /* unterminated'),
    /Unterminated \/\* comment at position 4/
  );
});

// --- Errors ---------------------------------------------------------------

test('tok: unknown character throws with position', () => {
  assert.throws(
    () => tokenize('1 @ 2'),
    /Unexpected character "@" at position 2/
  );
});

// --- EOF ------------------------------------------------------------------

test('tok: always ends with an eof token', () => {
  const ts = tokenize('1');
  assert.equal(ts[ts.length - 1]!.type, 'eof');
});

test('tok: empty input yields a single eof', () => {
  const ts = tokenize('');
  assert.equal(ts.length, 1);
  assert.equal(ts[0]!.type, 'eof');
});

test('tok: whitespace-only input yields a single eof', () => {
  const ts = tokenize('   ');
  assert.equal(ts.length, 1);
  assert.equal(ts[0]!.type, 'eof');
  assert.equal(ts[0]!.ws, true);
});

// --- Positions ------------------------------------------------------------

test('tok: token positions point to the first char of each token', () => {
  const ts = tokenize('12 + 34');
  assert.equal(ts[0]!.pos, 0); // `12`
  assert.equal(ts[1]!.pos, 3); // `+`
  assert.equal(ts[2]!.pos, 5); // `34`
});
