import { test } from 'node:test';
import assert from 'node:assert/strict';

import { out } from '../../helpers/out.ts';

test('abs: positive number → unchanged', () => {
  assert.equal(out('abs(5)'), '5');
});

test('abs: negative number → magnitude', () => {
  assert.equal(out('abs(-5)'), '5');
});

test('abs: zero → 0', () => {
  assert.equal(out('abs(0)'), '0');
});

test('abs: positive dimension → unchanged', () => {
  assert.equal(out('abs(10px)'), '10px');
});

test('abs: negative dimension → magnitude with unit', () => {
  assert.equal(out('abs(-10px)'), '10px');
});

test('abs: negative em → magnitude (relative units fold)', () => {
  assert.equal(out('abs(-5em)'), '5em');
});

test('abs: var() → opaque', () => {
  assert.equal(out('abs(var(--x))'), 'abs(var(--x))');
});

test('abs: percentage → opaque (sign unresolvable without context)', () => {
  assert.equal(out('abs(-50%)'), 'abs(-50%)');
});

test('abs: inner sum folds first then abs', () => {
  assert.equal(out('abs(calc(1px - 3px))'), '2px');
});

test('abs: NaN passes through', () => {
  assert.equal(out('abs(NaN)'), 'calc(NaN)');
});

test('abs: infinity → infinity', () => {
  assert.equal(out('abs(infinity)'), 'calc(infinity)');
});

test('abs: -infinity → infinity (Math.abs of -Infinity)', () => {
  // The parser doesn't fold a leading `-` before `infinity` into `-Infinity`;
  // it produces unary minus over Num(Infinity) which negate() turns into
  // Num(-Infinity). abs of that is +Infinity.
  assert.equal(out('abs(calc(0 - infinity))'), 'calc(infinity)');
});

test('abs: wrong arity → opaque', () => {
  assert.equal(out('abs()'), 'abs()');
  assert.equal(out('abs(1, 2)'), 'abs(1, 2)');
});

