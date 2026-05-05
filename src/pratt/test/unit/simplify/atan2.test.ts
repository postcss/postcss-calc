import { test } from 'node:test';
import assert from 'node:assert/strict';

import { out } from '../../helpers/out.ts';

//
// Two args of a consistent type (both <number>, both <dimension> of the
// same base, or both <percentage>). Result <angle> in degrees, in
// (-180deg, 180deg]. We reuse foldConstArgs for the type-match enforcement;
// percentages are opaque (matches csstools — they need property-context
// resolution).

test('atan2: (0, 1) → 0deg', () => {
  assert.equal(out('atan2(0, 1)'), '0deg');
});

test('atan2: (1, 0) → 90deg', () => {
  assert.equal(out('atan2(1, 0)'), '90deg');
});

test('atan2: (0, -1) → 180deg', () => {
  assert.equal(out('atan2(0, -1)'), '180deg');
});

test('atan2: (-1, 0) → -90deg', () => {
  assert.equal(out('atan2(-1, 0)'), '-90deg');
});

test('atan2: (1, 1) → 45deg', () => {
  assert.equal(out('atan2(1, 1)'), '45deg');
});

test('atan2: (-1, 1) → -45deg', () => {
  assert.equal(out('atan2(-1, 1)'), '-45deg');
});

test('atan2: (1, -1) → 135deg', () => {
  assert.equal(out('atan2(1, -1)'), '135deg');
});

test('atan2: (-1, -1) → -135deg', () => {
  assert.equal(out('atan2(-1, -1)'), '-135deg');
});

test('atan2: same-unit dim args fold (1px, 1px) → 45deg', () => {
  // atan2 only depends on the ratio when both args share a unit.
  assert.equal(out('atan2(1px, 1px)'), '45deg');
});

test('atan2: cross-unit-same-base (1in, 96px) → 45deg', () => {
  // 1in = 96px → ratio 1 → 45deg.
  assert.equal(out('atan2(1in, 96px)'), '45deg');
});

test('atan2: spec table (infinity, infinity) → 45deg', () => {
  assert.equal(out('atan2(infinity, infinity)'), '45deg');
});

test('atan2: spec table (-infinity, -infinity) → -135deg', () => {
  assert.equal(out('atan2(-infinity, -infinity)'), '-135deg');
});

test('atan2: same-base angle args (1deg, 1deg) → 45deg', () => {
  // Spec only requires consistent type — angles for both args is fine.
  assert.equal(out('atan2(1deg, 1deg)'), '45deg');
});

test('atan2: type mismatch (length, angle) → opaque', () => {
  assert.equal(out('atan2(1px, 1deg)'), 'atan2(1px, 1deg)');
});

test('atan2: type mismatch (number, length) → opaque', () => {
  assert.equal(out('atan2(1, 1px)'), 'atan2(1, 1px)');
});

test('atan2: percentage args → opaque (need property context)', () => {
  assert.equal(out('atan2(50%, 50%)'), 'atan2(50%, 50%)');
});

test('atan2: opaque var() arg → opaque', () => {
  assert.equal(out('atan2(var(--x), 1)'), 'atan2(var(--x), 1)');
});

test('atan2: wrong arity → opaque', () => {
  assert.equal(out('atan2(1)'), 'atan2(1)');
  assert.equal(out('atan2(1, 2, 3)'), 'atan2(1, 2, 3)');
});

test('atan2: case-insensitive', () => {
  assert.equal(out('ATAN2(1, 1)'), out('atan2(1, 1)'));
});

test('atan2: NaN arg → NaN (drops unit; serialized as calc(NaN))', () => {
  // Exercises the isNaN(radians) → num(NaN) gate. Without it the result
  // would serialize as `NaNdeg` (a meaningless "dimension").
  assert.equal(out('atan2(NaN, 1)'), 'calc(NaN)');
  assert.equal(out('atan2(1, NaN)'), 'calc(NaN)');
});

