// Cribbed from @csstools/css-calc test corpus:
//   https://github.com/csstools/postcss-plugins/tree/main/packages/css-calc/test
//
// Each test cites its source file. Cases selected where our pipeline
// produces the same output as csstools. Deliberately excluded:
//   - csstools `globals` option (variable substitution) — not in our scope
//   - relative-color math (`rgb(from ...)`) — out of scope
//   - exponential family (pow/sqrt/hypot/log/exp) — not yet implemented
//   - cases where floating-point serialization precision differs (we use
//     `precision: false` to emit full-float, but csstools occasionally
//     rounds at ~15 significant figures in its own way)
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { out as pipeline } from '../helpers/out.js';

/** Full-precision output, matching csstools' default. */
const out = (input) => pipeline(input, { precision: false });

// --- trig/test.js (§10.4) -----------------------------------------------
//
// `out` here uses precision: false, so floating-point artifacts that the
// default-precision unit suite swallows show through here as the literal
// JS strings (e.g. cos(60deg) = 0.5000000000000001).
describe('csstools trig:', () => {
  test('csstools trig: sin(0) → 0', () => {
    assert.equal(out('sin(0)'), '0');
  });

  test('csstools trig: cos(0) → 1', () => {
    assert.equal(out('cos(0)'), '1');
  });

  test('csstools trig: tan(0) → 0', () => {
    assert.equal(out('tan(0)'), '0');
  });

  test('csstools trig: sin(90deg) → 1', () => {
    assert.equal(out('sin(90deg)'), '1');
  });

  test('csstools trig: cos(180deg) → -1', () => {
    assert.equal(out('cos(180deg)'), 'calc(-1)');
  });

  test('csstools trig: cos(60deg) → 0.5000000000000001 (full precision)', () => {
    assert.equal(out('cos(60deg)'), 'calc(.5000000000000001)');
  });

  test('csstools trig: tan(45deg) → 0.9999999999999999 (full precision)', () => {
    assert.equal(out('tan(45deg)'), 'calc(.9999999999999999)');
  });

  test('csstools trig: sin(pi) → 1.2246467991473532e-16 (full precision)', () => {
    assert.equal(out('sin(pi)'), 'calc(1.2246467991473532e-16)');
  });

  test('csstools trig: sin(0.5turn) → 1.2246467991473532e-16', () => {
    assert.equal(out('sin(0.5turn)'), 'calc(1.2246467991473532e-16)');
  });

  test('csstools trig: bare-number arg is radians — sin(pi / 2) → 1', () => {
    assert.equal(out('sin(pi / 2)'), '1');
  });

  test('csstools trig: var() arg → opaque', () => {
    assert.equal(out('sin(var(--x))'), 'sin(var(--x))');
  });

  test('csstools trig: length arg → opaque (must be number or angle)', () => {
    assert.equal(out('sin(10px)'), 'sin(10px)');
  });

  test('csstools inverse-trig: asin(0) → 0deg', () => {
    assert.equal(out('asin(0)'), '0deg');
  });

  test('csstools inverse-trig: asin(1) → 90deg', () => {
    assert.equal(out('asin(1)'), '90deg');
  });

  test('csstools inverse-trig: asin(-1) → -90deg', () => {
    assert.equal(out('asin(-1)'), 'calc(-90deg)');
  });

  test('csstools inverse-trig: asin(0.5) → 30.000000000000004deg', () => {
    assert.equal(out('asin(0.5)'), '30.000000000000004deg');
  });

  test('csstools inverse-trig: acos(1) → 0deg (zero-valued angle keeps unit)', () => {
    assert.equal(out('acos(1)'), '0deg');
  });

  test('csstools inverse-trig: acos(-1) → 180deg', () => {
    assert.equal(out('acos(-1)'), '180deg');
  });

  test('csstools inverse-trig: atan(1) → 45deg (exact in JS)', () => {
    assert.equal(out('atan(1)'), '45deg');
  });

  test('csstools inverse-trig: atan(infinity) → 90deg', () => {
    assert.equal(out('atan(infinity)'), '90deg');
  });

  test('csstools inverse-trig: dim arg → opaque (asin/acos/atan need <number>)', () => {
    assert.equal(out('asin(45deg)'), 'asin(45deg)');
  });

  test('csstools atan2: (0, 1) → 0deg', () => {
    assert.equal(out('atan2(0, 1)'), '0deg');
  });

  test('csstools atan2: (1, 0) → 90deg', () => {
    assert.equal(out('atan2(1, 0)'), '90deg');
  });

  test('csstools atan2: (1, 1) → 45deg', () => {
    assert.equal(out('atan2(1, 1)'), '45deg');
  });

  test('csstools atan2: (-1, -1) → -135deg', () => {
    assert.equal(out('atan2(-1, -1)'), 'calc(-135deg)');
  });

  test('csstools atan2: cross-unit-same-base (1in, 96px) → 45deg', () => {
    assert.equal(out('atan2(1in, 96px)'), '45deg');
  });

  test('csstools atan2: type mismatch → opaque', () => {
    assert.equal(out('atan2(1px, 1deg)'), 'atan2(1px, 1deg)');
  });

  test('csstools atan2: percentages → opaque', () => {
    assert.equal(out('atan2(50%, 50%)'), 'atan2(50%, 50%)');
  });
});
