import { test } from 'node:test';
import assert from 'node:assert/strict';

import { out } from '../../helpers/out.ts';

test('hypot: (3, 4) → 5', () => {
  assert.equal(out('hypot(3, 4)'), '5');
});

test('hypot: (3px, 4px) → 5px', () => {
  assert.equal(out('hypot(3px, 4px)'), '5px');
});

test('hypot: single positive arg equals abs(arg)', () => {
  assert.equal(out('hypot(2em)'), '2em');
});

test('hypot: single negative arg becomes positive (sqrt of squared value)', () => {
  assert.equal(out('hypot(-2em)'), '2em');
});

test('hypot: cross-unit-same-base (1in, 96px) folds in first-arg unit', () => {
  // foldConstArgs converts 96px → 1in, so hypot folds as sqrt(1²+1²) = √2,
  // unit stays `in` (the first arg's unit).
  assert.equal(out('hypot(1in, 96px)'), '1.41421in');
});

test('hypot: type mismatch → opaque', () => {
  assert.equal(out('hypot(1px, 1deg)'), 'hypot(1px, 1deg)');
});

test('hypot: percentage → opaque (need property context)', () => {
  assert.equal(out('hypot(50%, 50%)'), 'hypot(50%, 50%)');
});

test('hypot: number args fold (5, 12) → 13', () => {
  assert.equal(out('hypot(5, 12)'), '13');
});

test('hypot: zero args → opaque', () => {
  assert.equal(out('hypot()'), 'hypot()');
});

test('hypot: var() → opaque', () => {
  assert.equal(out('hypot(var(--x), 1px)'), 'hypot(var(--x), 1px)');
});

test('hypot: infinity dominates → infinity', () => {
  assert.equal(out('hypot(infinity, 1)'), 'calc(infinity)');
});

test('hypot: case-insensitive', () => {
  assert.equal(out('HYPOT(3, 4)'), out('hypot(3, 4)'));
});

