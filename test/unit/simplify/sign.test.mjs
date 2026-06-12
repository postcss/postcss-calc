import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';
test('sign: positive number → 1', () => {
  assert.equal(out('sign(5)'), '1');
});
test('sign: negative number → -1', () => {
  assert.equal(out('sign(-5)'), '-1');
});
test('sign: zero → 0', () => {
  assert.equal(out('sign(0)'), '0');
});
test('sign: positive dimension → 1 (returns <number> regardless of input)', () => {
  assert.equal(out('sign(10px)'), '1');
});
test('sign: negative dimension → -1', () => {
  assert.equal(out('sign(-10px)'), '-1');
});
test('sign: zero dimension → 0', () => {
  assert.equal(out('sign(0px)'), '0');
});
test('sign: var() → opaque', () => {
  assert.equal(out('sign(var(--x))'), 'sign(var(--x))');
});
test('sign: percentage → opaque (sign unresolvable without context, §10.6 note)', () => {
  assert.equal(out('sign(50%)'), 'sign(50%)');
  assert.equal(out('sign(-50%)'), 'sign(-50%)');
});
test('sign: inner sum folds first then sign', () => {
  assert.equal(out('sign(calc(1px - 3px))'), '-1');
});
test('sign: infinity → 1', () => {
  assert.equal(out('sign(infinity)'), '1');
});
test('sign: -infinity → -1', () => {
  assert.equal(out('sign(calc(0 - infinity))'), '-1');
});
test('sign: NaN → NaN', () => {
  assert.equal(out('sign(NaN)'), 'calc(NaN)');
});
test('sign: wrong arity → opaque', () => {
  assert.equal(out('sign()'), 'sign()');
  assert.equal(out('sign(1, 2)'), 'sign(1, 2)');
});
