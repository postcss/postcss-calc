import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';
//
// Numbers in (spec §10.4 line 1046: "must resolve to a <number>"); result
// in degrees. NaN out-of-domain results stay as bare NaN — degenerate-
// numeric serialization (calc(NaN * 1deg)) is a planned follow-up.
test('asin: 0 → 0deg', () => {
  assert.equal(out('asin(0)'), '0deg');
});
test('asin: 1 → 90deg', () => {
  assert.equal(out('asin(1)'), '90deg');
});
test('asin: -1 → -90deg', () => {
  assert.equal(out('asin(-1)'), '-90deg');
});
test('asin: 0.5 → 30deg (Math.asin(0.5)*180/π = 30.0000... rounds to 30)', () => {
  assert.equal(out('asin(0.5)'), '30deg');
});
test('acos: 0 → 90deg', () => {
  assert.equal(out('acos(0)'), '90deg');
});
test('acos: 1 → 0deg (zero-valued angle keeps the unit per §10.10)', () => {
  assert.equal(out('acos(1)'), '0deg');
});
test('acos: -1 → 180deg', () => {
  assert.equal(out('acos(-1)'), '180deg');
});
test('atan: 0 → 0deg', () => {
  assert.equal(out('atan(0)'), '0deg');
});
test('atan: 1 → 45deg (exact in JS)', () => {
  assert.equal(out('atan(1)'), '45deg');
});
test('atan: -1 → -45deg', () => {
  assert.equal(out('atan(-1)'), '-45deg');
});
test('atan: infinity → 90deg (Math.atan(Infinity) = π/2 exactly)', () => {
  assert.equal(out('atan(infinity)'), '90deg');
});
test('atan: -infinity → -90deg', () => {
  assert.equal(out('atan(-infinity)'), '-90deg');
});
test('asin: out-of-domain → NaN', () => {
  assert.equal(out('asin(2)'), 'calc(NaN)');
});
test('acos: out-of-domain → NaN', () => {
  assert.equal(out('acos(-2)'), 'calc(NaN)');
});
test('asin: length is not a <number> → opaque', () => {
  assert.equal(out('asin(10px)'), 'asin(10px)');
});
test('asin: percentage → opaque', () => {
  assert.equal(out('asin(50%)'), 'asin(50%)');
});
test('asin: angle dimension is not a <number> → opaque', () => {
  // asin/acos/atan accept only <number>; an angle arg is invalid.
  assert.equal(out('asin(45deg)'), 'asin(45deg)');
});
test('asin: var() → opaque', () => {
  assert.equal(out('asin(var(--x))'), 'asin(var(--x))');
});
test('atan: pi folds through (pi - pi simplifies to 0 before atan)', () => {
  assert.equal(out('atan(pi - pi)'), '0deg');
});
test('atan: wrong arity (two args) → opaque (atan2 is the two-arg form)', () => {
  assert.equal(out('atan(1, 2)'), 'atan(1, 2)');
});
test('atan: case-insensitive', () => {
  assert.equal(out('ATAN(1)'), out('atan(1)'));
});
