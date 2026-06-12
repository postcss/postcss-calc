import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';
test('mod: positive A and positive B', () => {
  assert.equal(out('mod(18, 5)'), '3');
  assert.equal(out('mod(18px, 5px)'), '3px');
});
test('rem: positive A and positive B (== mod when same sign)', () => {
  assert.equal(out('rem(18, 5)'), '3');
  assert.equal(out('rem(18px, 5px)'), '3px');
});
test('mod: negative A and negative B (spec example -140deg, -90deg → -50deg)', () => {
  assert.equal(out('mod(-140deg, -90deg)'), '-50deg');
});
test('rem: negative A and negative B (== mod when same sign)', () => {
  assert.equal(out('rem(-140deg, -90deg)'), '-50deg');
});
test('mod: negative A and positive B (spec example -18px, 5px → 2px — sign of B)', () => {
  assert.equal(out('mod(-18px, 5px)'), '2px');
});
test('rem: negative A and positive B (spec example -18px, 5px → -3px — sign of A)', () => {
  assert.equal(out('rem(-18px, 5px)'), '-3px');
});
test('mod: positive A and negative B (spec example 140deg, -90deg → -40deg)', () => {
  assert.equal(out('mod(140deg, -90deg)'), '-40deg');
});
test('rem: positive A and negative B (spec example 140deg, -90deg → 50deg)', () => {
  assert.equal(out('rem(140deg, -90deg)'), '50deg');
});
test('mod: exact multiple → 0', () => {
  assert.equal(out('mod(10px, 5px)'), '0px');
});
test('rem: exact multiple → 0', () => {
  assert.equal(out('rem(10px, 5px)'), '0px');
});
test('mod: cross-unit conversion (1in, 24px) — 96px mod 24px = 0px in first unit', () => {
  assert.equal(out('mod(1in, 24px)'), '0in');
});
test('mod: B=0 → NaN', () => {
  assert.equal(out('mod(5, 0)'), 'calc(NaN)');
  assert.equal(out('mod(5px, 0px)'), 'calc(NaN)');
});
test('rem: B=0 → NaN', () => {
  assert.equal(out('rem(5, 0)'), 'calc(NaN)');
});
test('mod: opaque var() arg → opaque', () => {
  assert.equal(out('mod(var(--x), 5)'), 'mod(var(--x), 5)');
  assert.equal(out('mod(5, var(--x))'), 'mod(5, var(--x))');
});
test('rem: opaque var() arg → opaque', () => {
  assert.equal(out('rem(var(--x), 5)'), 'rem(var(--x), 5)');
});
test('mod: type mismatch → opaque', () => {
  assert.equal(out('mod(1px, 1deg)'), 'mod(1px, 1deg)');
  assert.equal(out('mod(1px, 1)'), 'mod(1px, 1)');
});
test('rem: type mismatch → opaque', () => {
  assert.equal(out('rem(1px, 1deg)'), 'rem(1px, 1deg)');
});
test('mod: percentage → opaque (sign unresolvable)', () => {
  assert.equal(out('mod(50%, 10%)'), 'mod(50%, 10%)');
});
test('mod: A is infinite → NaN', () => {
  assert.equal(out('mod(infinity, 5)'), 'calc(NaN)');
});
test('rem: A is infinite → NaN', () => {
  assert.equal(out('rem(infinity, 5)'), 'calc(NaN)');
});
test('mod: B infinite, A same sign → A unchanged', () => {
  assert.equal(out('mod(5, infinity)'), '5');
});
test('rem: B infinite → A unchanged', () => {
  assert.equal(out('rem(5, infinity)'), '5');
  assert.equal(out('rem(-5, infinity)'), '-5');
});
test('mod: B infinite, A opposite sign → NaN', () => {
  assert.equal(out('mod(-5, infinity)'), 'calc(NaN)');
});
test('mod: wrong arity → opaque', () => {
  assert.equal(out('mod(5)'), 'mod(5)');
  assert.equal(out('mod(5, 2, 1)'), 'mod(5, 2, 1)');
});
test('mod: zero A and finite B → 0 (preserves type)', () => {
  assert.equal(out('mod(0, 5)'), '0');
  assert.equal(out('mod(0px, 5px)'), '0px');
});
test('rem: zero A and finite B → 0', () => {
  assert.equal(out('rem(0, 5)'), '0');
});
