import { test } from 'node:test';
import assert from 'node:assert/strict';

import { out } from '../../helpers/out.ts';

test('round: default strategy = nearest, A and B numbers', () => {
  assert.equal(out('round(15, 10)'), '20');
  assert.equal(out('round(14, 10)'), '10');
});

test('round: default strategy with dim args', () => {
  assert.equal(out('round(15px, 10px)'), '20px');
});

test('round: explicit nearest strategy', () => {
  assert.equal(out('round(nearest, 14, 10)'), '10');
  assert.equal(out('round(nearest, 15, 10)'), '20');
});

test('round: tie breaks to upper B (§10.3 line 978)', () => {
  assert.equal(out('round(15, 10)'), '20');
  assert.equal(out('round(-15, 10)'), '-10'); // upper of {-20, -10} is -10
});

test('round: up strategy → ceiling step', () => {
  assert.equal(out('round(up, 11, 10)'), '20');
  assert.equal(out('round(up, 10, 10)'), '10'); // exact multiple
  assert.equal(out('round(up, -11, 10)'), '-10');
});

test('round: down strategy → floor step', () => {
  assert.equal(out('round(down, 19, 10)'), '10');
  assert.equal(out('round(down, -11, 10)'), '-20');
});

test('round: to-zero strategy', () => {
  assert.equal(out('round(to-zero, 19, 10)'), '10');
  assert.equal(out('round(to-zero, -19, 10)'), '-10');
  assert.equal(out('round(to-zero, 1, 10)'), '0');
  assert.equal(out('round(to-zero, -1, 10)'), '0');
});

test('round: B omitted with <number> A defaults to 1', () => {
  assert.equal(out('round(3.7)'), '4');
  assert.equal(out('round(3.2)'), '3');
  assert.equal(out('round(down, 3.7)'), '3');
  assert.equal(out('round(up, 3.2)'), '4');
});

test('round: B omitted with dimensional A → opaque (function invalid)', () => {
  assert.equal(out('round(3.7px)'), 'round(3.7px)');
});

test('round: B = 0 → NaN', () => {
  assert.equal(out('round(5, 0)'), 'calc(NaN)');
  assert.equal(out('round(up, 5, 0)'), 'calc(NaN)');
  // Dim arg currently drops unit: `round(5px, 0px)` → `calc(NaN)`. The
  // unit-preserving `calc(NaN * 1px)` form would require simplifyRound to
  // emit `dim(NaN, unit)` instead of bare Num(NaN); deferred.
  assert.equal(out('round(5px, 0px)'), 'calc(NaN)');
  assert.equal(out('round(down, 10deg, 0deg)'), 'calc(NaN)');
});

test('round: opaque var() arg → opaque', () => {
  assert.equal(out('round(var(--x), 10px)'), 'round(var(--x), 10px)');
  assert.equal(out('round(up, var(--x), 10)'), 'round(up, var(--x), 10)');
});

test('round: type mismatch → opaque', () => {
  assert.equal(out('round(1px, 1deg)'), 'round(1px, 1deg)');
});

test('round: percentage → opaque (sign unresolvable)', () => {
  assert.equal(out('round(50%, 10%)'), 'round(50%, 10%)');
});

test('round: unrecognized strategy ident → opaque (don`t guess)', () => {
  assert.equal(out('round(weird, 10, 5)'), 'round(weird, 10, 5)');
});

test('round: cross-unit conversion (1in, 24px) — unit of A wins', () => {
  // 1in = 96px; round(96px, 24px) = 96px = 1in.
  assert.equal(out('round(1in, 24px)'), '1in');
});

test('round: negative A with each strategy', () => {
  assert.equal(out('round(nearest, -7, 5)'), '-5'); // {-10, -5}, |-2| < |-3|
  assert.equal(out('round(up, -7, 5)'), '-5');
  assert.equal(out('round(down, -7, 5)'), '-10');
  assert.equal(out('round(to-zero, -7, 5)'), '-5');
});

test('round: negative B is allowed', () => {
  // Spec defines lower B = nearest multiple of |B| ≤ -∞-ward, upper B
  // = +∞-ward, regardless of sign(B). For round(15, -10) the candidates
  // are 10 and 20 (multiples of -10 bracketing 15); tie breaks to upper
  // (= closer to +∞) → 20.
  assert.equal(out('round(15, -10)'), '20');
});

test('round: wrong arity (zero args) → opaque', () => {
  assert.equal(out('round()'), 'round()');
});

test('round: too many args → opaque', () => {
  assert.equal(out('round(up, 1, 2, 3)'), 'round(up, 1, 2, 3)');
});

test('round: A infinite, B finite → same infinity (§10.3.1 line 1022)', () => {
  assert.equal(out('round(infinity, 10)'), 'calc(infinity)');
  assert.equal(out('round(calc(0 - infinity), 10)'), 'calc(-infinity)');
  assert.equal(out('round(up, infinity, 10)'), 'calc(infinity)');
  assert.equal(out('round(down, calc(0 - infinity), 10)'), 'calc(-infinity)');
});

test('round: zero A → 0 (exact multiple)', () => {
  assert.equal(out('round(0, 5)'), '0');
  assert.equal(out('round(up, 0, 5)'), '0');
  assert.equal(out('round(0px, 5px)'), '0px');
});

test('round: negative B with non-nearest strategies', () => {
  // round(to-zero, 7, -5): candidates {5, 10}; |5| smaller → 5.
  assert.equal(out('round(to-zero, 7, -5)'), '5');
  // round(up, 7, -5): upper (closer to +∞) of {5, 10} → 10.
  assert.equal(out('round(up, 7, -5)'), '10');
  // round(down, 7, -5): lower → 5.
  assert.equal(out('round(down, 7, -5)'), '5');
});

