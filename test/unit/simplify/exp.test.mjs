import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';
test('exp: 0 → 1', () => {
  assert.equal(out('exp(0)'), '1');
});
test('exp: 1 → e (rounds to 2.71828 at precision 5)', () => {
  assert.equal(out('exp(1)'), '2.71828');
});
test('exp: -infinity → 0', () => {
  assert.equal(out('exp(-infinity)'), '0');
});
test('exp: infinity → infinity', () => {
  assert.equal(out('exp(infinity)'), 'calc(infinity)');
});
test('exp: pi keyword folds first', () => {
  assert.equal(out('exp(pi)'), '23.14069');
});
test('exp: dim arg → opaque', () => {
  assert.equal(out('exp(1px)'), 'exp(1px)');
});
test('exp: var() → opaque', () => {
  assert.equal(out('exp(var(--x))'), 'exp(var(--x))');
});
test('exp: wrong arity → opaque (exercises arg-count guard)', () => {
  // Stryker survivor #2: the `args.length !== 1` clause was never killed
  // because we didn't have a 2-arg case for exp.
  assert.equal(out('exp(1, 2)'), 'exp(1, 2)');
  assert.equal(out('exp()'), 'exp()');
});
