import { test } from 'node:test';
import assert from 'node:assert/strict';

import { out } from '../../helpers/out.ts';

//
// Bare <number> is interpreted as radians (§10.4 line 1044). <angle>
// dimensions convert to radians via the existing length/angle conversion
// table. Output is a bare <number>. Outputs assume default precision 5;
// values like Math.sin(Math.PI) ≈ 1.2e-16 round to 0.

test('sin: zero', () => {
  assert.equal(out('sin(0)'), '0');
});

test('cos: zero', () => {
  assert.equal(out('cos(0)'), '1');
});

test('tan: zero', () => {
  assert.equal(out('tan(0)'), '0');
});

test('sin: 90deg → 1 (exact in JS)', () => {
  assert.equal(out('sin(90deg)'), '1');
});

test('cos: 90deg → 0 (Math.cos(π/2) ≈ 6e-17 rounds at precision 5)', () => {
  assert.equal(out('cos(90deg)'), '0');
});

test('sin: 0.5turn → 0 (Math.sin(π) ≈ 1.2e-16 rounds at precision 5)', () => {
  assert.equal(out('sin(0.5turn)'), '0');
});

test('sin: 200grad → 0 (200grad = π rad)', () => {
  assert.equal(out('sin(200grad)'), '0');
});

test('sin: pi keyword folds before sin sees the arg', () => {
  // Parser folds `pi` to Num(π); simplifier delivers it as a plain Num.
  assert.equal(out('sin(pi)'), '0');
});

test('sin: pi / 2 folds to a Num before sin', () => {
  assert.equal(out('sin(pi / 2)'), '1');
});

test('cos: pi keyword → -1', () => {
  assert.equal(out('cos(pi)'), '-1');
});

test('cos: 60deg → 0.5', () => {
  assert.equal(out('cos(60deg)'), '0.5');
});

test('tan: 45deg → 1 (Math.tan(π/4) = 0.999... rounds to 1)', () => {
  assert.equal(out('tan(45deg)'), '1');
});

test('sin: rad input is identity (no conversion needed)', () => {
  // Math.sin(1) = 0.8414709848078965; rounds to 0.84147 at precision 5.
  assert.equal(out('sin(1rad)'), '0.84147');
});

test('sin: infinity → NaN (Math.sin of non-finite)', () => {
  assert.equal(out('sin(infinity)'), 'calc(NaN)');
});

test('cos: infinity → NaN', () => {
  assert.equal(out('cos(infinity)'), 'calc(NaN)');
});

test('tan: infinity → NaN', () => {
  assert.equal(out('tan(infinity)'), 'calc(NaN)');
});

test('sin: var() → opaque', () => {
  assert.equal(out('sin(var(--x))'), 'sin(var(--x))');
});

test('sin: length is not an angle → opaque', () => {
  assert.equal(out('sin(10px)'), 'sin(10px)');
});

test('sin: percentage → opaque (no property context)', () => {
  assert.equal(out('sin(50%)'), 'sin(50%)');
});

test('sin: wrong arity → opaque', () => {
  assert.equal(out('sin(1, 2)'), 'sin(1, 2)');
  assert.equal(out('sin()'), 'sin()');
});

test('cos: inner sum folds first then cos', () => {
  // 1deg + 89deg → 90deg → cos(90deg) → ~0 (rounds to 0).
  assert.equal(out('cos(1deg + 89deg)'), '0');
});

test('sin: case-insensitive function and unit', () => {
  // CSS dim-unit case is normalized in the parser; function name dispatch
  // lowercases. SIN(45DEG) and sin(45deg) yield identical output.
  assert.equal(out('SIN(45DEG)'), out('sin(45deg)'));
});

