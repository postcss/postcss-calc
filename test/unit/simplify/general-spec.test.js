import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.js';

// --- §10.3 / §10.3.1 / §10.6 spec-text transcription --------------------
//
// One test per spec-stated rule, citing the spec line. These aren't bonus
// — they're the literal spec language as a checklist. If the spec changes,
// these flag the regression first.
test('spec §10.3 line 1004: mod(18px, 5px) === 3px', () => {
  assert.equal(out('mod(18px, 5px)'), '3px');
});

describe('spec §10.3 line 1005: Mod(-140deg -90deg', () => {
  test('spec §10.3 line 1005: mod(-140deg, -90deg) === -50deg', () => {
    assert.equal(out('mod(-140deg, -90deg)'), 'calc(-50deg)');
  });

  test('spec §10.3 line 1007: rem === mod when both args same sign', () => {
    assert.equal(out('rem(18px, 5px)'), '3px');
    assert.equal(out('rem(-140deg, -90deg)'), 'calc(-50deg)');
  });

  test('spec §10.3 line 1011: mod(-18px, 5px) === 2px', () => {
    assert.equal(out('mod(-18px, 5px)'), '2px');
  });

  test('spec §10.3 line 1012: rem(-18px, 5px) === -3px', () => {
    assert.equal(out('rem(-18px, 5px)'), 'calc(-3px)');
  });

  test('spec §10.3 line 1014: mod(140deg, -90deg) === -40deg', () => {
    assert.equal(out('mod(140deg, -90deg)'), 'calc(-40deg)');
  });

  test('spec §10.3 line 1014: rem(140deg, -90deg) === 50deg', () => {
    assert.equal(out('rem(140deg, -90deg)'), '50deg');
  });

  test('spec §10.3 line 978: nearest tie breaks to upper B', () => {
    // 15 is exactly between 10 and 20; spec says upper wins.
    assert.equal(out('round(15, 10)'), '20');
    // -15 between -20 and -10; upper (+∞-ward) is -10.
    assert.equal(out('round(-15, 10)'), 'calc(-10)');
  });

  test('spec §10.3 line 991: B defaults to 1 only when A is <number>', () => {
    assert.equal(out('round(3.7)'), '4');
    // A is dimensional → spec says "omitting B is otherwise invalid".
    assert.equal(out('round(3.7px)'), 'round(3.7px)');
  });

  test('spec §10.3.1 line 1020: round(A, 0) is NaN', () => {
    assert.equal(out('round(5, 0)'), 'calc(NaN)');
    assert.equal(out('round(up, 5, 0)'), 'calc(NaN)');
    assert.equal(out('round(down, 5, 0)'), 'calc(NaN)');
    assert.equal(out('round(to-zero, 5, 0)'), 'calc(NaN)');
  });

  test('spec §10.7.1: round(finite, ±infinity) is strategy-dependent', () => {
    // The multiples of an infinite step are {-∞, 0, +∞}. up (ceiling) lands
    // on +∞ for positive A; down (floor) lands on -∞ for negative A; nearest
    // and to-zero collapse to 0 carrying A's sign. The serializer collapses
    // sign-of-zero to match CSS's numeric `-0 === 0`.
    assert.equal(out('round(5, infinity)'), '0'); // nearest default
    assert.equal(out('round(up, 5, infinity)'), 'calc(infinity)');
    assert.equal(out('round(down, calc(0 - 5), infinity)'), 'calc(-infinity)');
    assert.equal(out('round(down, 5, infinity)'), '0');
    assert.equal(out('round(up, calc(0 - 5), infinity)'), '0');
    assert.equal(out('round(3, calc(0 - infinity))'), '0');
  });

  test('spec §10.7.1: round(_, NaN) is NaN', () => {
    assert.equal(out('round(5, calc(0 / 0))'), 'calc(NaN)');
    assert.equal(out('round(calc(0 - 5), calc(0 / 0))'), 'calc(NaN)');
  });

  test('spec §10.7.1: round(±infinity, ±infinity) is NaN', () => {
    assert.equal(out('round(infinity, infinity)'), 'calc(NaN)');
    assert.equal(out('round(calc(0 - infinity), infinity)'), 'calc(NaN)');
  });

  test('spec §10.3.1 line 1022: round(±infinity, finite) === same infinity', () => {
    assert.equal(out('round(infinity, 10)'), 'calc(infinity)');
    assert.equal(out('round(calc(0 - infinity), 10)'), 'calc(-infinity)');
    assert.equal(out('round(up, infinity, 10)'), 'calc(infinity)');
    assert.equal(out('round(down, calc(0 - infinity), 10)'), 'calc(-infinity)');
    assert.equal(out('round(to-zero, infinity, 10)'), 'calc(infinity)');
  });

  test('spec §10.3.1 line 1035: mod(±infinity, B) is NaN', () => {
    assert.equal(out('mod(infinity, 5)'), 'calc(NaN)');
    assert.equal(out('mod(calc(0 - infinity), 5)'), 'calc(NaN)');
  });

  test('spec §10.3.1 line 1035: rem(±infinity, B) is NaN', () => {
    assert.equal(out('rem(infinity, 5)'), 'calc(NaN)');
    assert.equal(out('rem(calc(0 - infinity), 5)'), 'calc(NaN)');
  });

  test('spec §10.3.1 line 1037: mod(A, infinity) opposite sign is NaN', () => {
    // A negative, B positive infinite → NaN.
    assert.equal(out('mod(-5, infinity)'), 'calc(NaN)');
    // A positive, B negative infinite → NaN.
    assert.equal(out('mod(5, calc(0 - infinity))'), 'calc(NaN)');
  });

  test('spec §10.3.1 line 1039: mod(A, infinity) same sign returns A', () => {
    assert.equal(out('mod(5, infinity)'), '5');
    // A = 0 is "same sign" (treated as 0⁺ — we don't track 0⁻ explicitly).
    // §10.3.1 line 1037 only NaNs on opposite-signed zero; we always
    // return A. Also exercises the `a !== 0` short-circuit in applyModRem.
    assert.equal(out('mod(0, infinity)'), '0');
    assert.equal(out('mod(0, calc(0 - infinity))'), '0');
  });

  test('spec §10.3.1 line 1039: rem(A, infinity) returns A regardless of sign', () => {
    assert.equal(out('rem(5, infinity)'), '5');
    assert.equal(out('rem(-5, infinity)'), 'calc(-5)');
    assert.equal(out('rem(0, infinity)'), '0');
  });

  test('spec §10.6 line 1144: abs(A) preserves type', () => {
    // Number stays number, dim stays dim with the same unit.
    assert.equal(out('abs(-5)'), '5');
    assert.equal(out('abs(-5px)'), '5px');
    assert.equal(out('abs(-5em)'), '5em');
    assert.equal(out('abs(-5deg)'), '5deg');
  });

  test('spec §10.6 line 1146: sign(A) always returns <number>', () => {
    // Even when input is a dimension, the result is a bare number.
    assert.equal(out('sign(-5)'), 'calc(-1)');
    assert.equal(out('sign(-5px)'), 'calc(-1)');
    assert.equal(out('sign(5em)'), '1');
    assert.equal(out('sign(0deg)'), '0');
  });

  test('spec §10.6 line 1148: percentage opaque (sign property-context-dependent)', () => {
    // "10% might be positive or negative once it's resolved" — we can't fold.
    assert.equal(out('abs(-50%)'), 'abs(-50%)');
    assert.equal(out('sign(50%)'), 'sign(50%)');
    assert.equal(out('sign(-50%)'), 'sign(-50%)');
  });
});

describe('CSS keywords case-insensitive: Rounding-strategy Idents', () => {
  test('CSS keywords case-insensitive: rounding-strategy idents', () => {
    // CSS idents are case-insensitive by default; our toLowerCase honors that.
    assert.equal(out('round(UP, 11, 10)'), '20');
    assert.equal(out('round(Down, 19, 10)'), '10');
    assert.equal(out('round(TO-ZERO, -19, 10)'), 'calc(-10)');
    assert.equal(out('round(Nearest, 14, 10)'), '10');
  });

  test('CSS function names case-insensitive: ROUND, MOD, REM, ABS, SIGN', () => {
    assert.equal(out('ROUND(15, 10)'), '20');
    assert.equal(out('MOD(18, 5)'), '3');
    assert.equal(out('REM(-18, 5)'), 'calc(-3)');
    assert.equal(out('ABS(-5)'), '5');
    assert.equal(out('SIGN(-5)'), 'calc(-1)');
  });
});
