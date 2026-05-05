import { test } from 'node:test';
import assert from 'node:assert/strict';

import { out } from '../../helpers/out.ts';

test('log: e (single arg, natural log) → 1', () => {
  assert.equal(out('log(e)'), '1');
});

test('log: 1 → 0', () => {
  assert.equal(out('log(1)'), '0');
});

test('log: 0 → -infinity', () => {
  assert.equal(out('log(0)'), 'calc(-infinity)');
});

test('log: -1 → NaN', () => {
  assert.equal(out('log(-1)'), 'calc(NaN)');
});

test('log: with base — log(8, 2) → 3', () => {
  assert.equal(out('log(8, 2)'), '3');
});

test('log: with base — log(100, 10) → 2', () => {
  assert.equal(out('log(100, 10)'), '2');
});

test('log: log(1, 1) → NaN (0/0 form)', () => {
  assert.equal(out('log(1, 1)'), 'calc(NaN)');
});

test('log: dim arg → opaque (number-only)', () => {
  assert.equal(out('log(1px)'), 'log(1px)');
});

test('log: var() → opaque', () => {
  assert.equal(out('log(var(--x), 10)'), 'log(var(--x), 10)');
});

test('log: wrong arity (3 args) → opaque', () => {
  assert.equal(out('log(1, 2, 3)'), 'log(1, 2, 3)');
});

test('log(exp(x)) round-trip → x', () => {
  // Composition exercises two helpers chained.
  assert.equal(out('log(exp(5))'), '5');
});

