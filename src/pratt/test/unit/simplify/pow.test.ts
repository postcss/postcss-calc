import { test } from 'node:test';
import assert from 'node:assert/strict';

import { out } from '../../helpers/out.ts';

//
// Two <number> args; result <number>. Math.pow handles all the IEEE
// boundary behaviour the spec calls out (pow(0,0)=1, pow(-1,0.5)=NaN,
// pow(infinity,0)=1).

test('pow: positive base and integer exponent', () => {
  assert.equal(out('pow(2, 3)'), '8');
});

test('pow: zero base with zero exponent → 1 (JS convention)', () => {
  assert.equal(out('pow(0, 0)'), '1');
});

test('pow: positive base and fractional exponent', () => {
  assert.equal(out('pow(4, 0.5)'), '2');
});

test('pow: negative base with integer exponent', () => {
  assert.equal(out('pow(-2, 3)'), '-8');
});

test('pow: negative base with non-integer exponent → NaN', () => {
  assert.equal(out('pow(-2, 0.5)'), 'calc(NaN)');
});

test('pow: zero with negative exponent → infinity', () => {
  assert.equal(out('pow(0, -1)'), 'calc(infinity)');
});

test('pow: infinity base with zero exponent → 1', () => {
  assert.equal(out('pow(infinity, 0)'), '1');
});

test('pow: pow(1, infinity) → NaN per IEEE-754 (indeterminate form)', () => {
  // ECMA-262 §6.1.6.1.3: pow(±1, ±∞) is NaN. The CSS spec defers to JS
  // here; we don't add a corrective branch.
  assert.equal(out('pow(1, infinity)'), 'calc(NaN)');
});

test('pow: e and pi keywords fold then pow', () => {
  assert.equal(out('pow(e, 2)'), '7.38906');
});

test('pow: dim arg → opaque (number-only per spec)', () => {
  assert.equal(out('pow(2px, 2)'), 'pow(2px, 2)');
});

test('pow: dim B with Num A → opaque (exercises args[1] type guard)', () => {
  // Stryker survivor #1: without a test where args[0] is Num but args[1]
  // is non-Num, the third clause of the type guard is never exercised.
  assert.equal(out('pow(2, 2px)'), 'pow(2, 2px)');
});

test('pow: var() arg → opaque', () => {
  assert.equal(out('pow(var(--x), 2)'), 'pow(var(--x), 2)');
});

test('pow: wrong arity → opaque', () => {
  assert.equal(out('pow(2)'), 'pow(2)');
  assert.equal(out('pow(2, 3, 4)'), 'pow(2, 3, 4)');
});

test('pow: case-insensitive', () => {
  assert.equal(out('POW(2, 3)'), out('pow(2, 3)'));
});

