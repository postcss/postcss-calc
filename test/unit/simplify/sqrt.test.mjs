import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';
test('sqrt: positive number', () => {
  assert.equal(out('sqrt(4)'), '2');
});
test('sqrt: zero', () => {
  assert.equal(out('sqrt(0)'), '0');
});
test('sqrt: negative → NaN', () => {
  assert.equal(out('sqrt(-1)'), 'calc(NaN)');
});
test('sqrt: infinity → infinity', () => {
  assert.equal(out('sqrt(infinity)'), 'calc(infinity)');
});
test('sqrt: dim arg → opaque (number-only)', () => {
  assert.equal(out('sqrt(4px)'), 'sqrt(4px)');
});
test('sqrt: var() → opaque', () => {
  assert.equal(out('sqrt(var(--x))'), 'sqrt(var(--x))');
});
test('sqrt: wrong arity → opaque', () => {
  assert.equal(out('sqrt(1, 2)'), 'sqrt(1, 2)');
});
