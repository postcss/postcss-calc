import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.js';

// --- Boundary-value matrix (corner cases random gen will never hit) ------
//
// These are values that historically break math implementations: signed
// zero, subnormal floats, exact-tie midpoints, FP-imprecise decimals, and
// values near JS number limits. Random fast-check generators bias toward
// small ints and almost never roll these.
test('boundary: round at exact tie midpoints across signs', () => {
  // Spec §10.3 line 978: tie → upper B (closer to +∞).
  assert.equal(out('round(5, 10)'), '10'); // {0, 10}, tie → upper
  assert.equal(out('round(-5, 10)'), '0'); // {-10, 0}, tie → upper (= 0)
  assert.equal(out('round(15, 10)'), '20');
  assert.equal(out('round(-15, 10)'), 'calc(-10)');
  assert.equal(out('round(25, 10)'), '30');
  assert.equal(out('round(0.5, 1)'), '1');
  assert.equal(out('round(-0.5, 1)'), '0');
});

describe('boundary: Round Just-below-tie', () => {
  test('boundary: round just-below-tie and just-above-tie', () => {
    // 4.999...9 should still pick lower (= 0); 5.000...1 should pick upper.
    // Use precision-safe values: differences > Number.EPSILON*5.
    assert.equal(out('round(4.9, 10)'), '0');
    assert.equal(out('round(5.1, 10)'), '10');
    assert.equal(out('round(-4.9, 10)'), '0');
    assert.equal(out('round(-5.1, 10)'), 'calc(-10)');
  });

  test('boundary: round on exact multiple preserves value', () => {
    assert.equal(out('round(20, 10)'), '20');
    assert.equal(out('round(0, 10)'), '0');
    assert.equal(out('round(-30, 10)'), 'calc(-30)');
    assert.equal(out('round(up, 20, 10)'), '20');
    assert.equal(out('round(down, 20, 10)'), '20');
    assert.equal(out('round(to-zero, 20, 10)'), '20');
  });

  test('boundary: round with very small B', () => {
    // 0.5 / 0.1 = 5, exact multiple. Result should be .5.
    assert.equal(out('round(0.5, 0.1)'), 'calc(.5)');
    // 0.1 + 0.2 in FP is 0.30000000000000004, but our parser tokenizes
    // literal `0.3` as 0.3 — so this is exact-multiple territory.
    assert.equal(out('round(0.3, 0.1)'), 'calc(.3)');
  });

  test('boundary: round with B much larger than A', () => {
    assert.equal(out('round(0.001, 1000)'), '0');
    assert.equal(out('round(up, 0.001, 1000)'), '1000');
    assert.equal(out('round(down, 0.001, 1000)'), '0');
    assert.equal(out('round(to-zero, 0.001, 1000)'), '0');
    assert.equal(out('round(to-zero, -0.001, 1000)'), '0');
  });

  test('boundary: round with A near integer limits', () => {
    // 999999 / 100 = 9999.99: lower = 999900, upper = 1000000. Distances: 99
    // vs 1 → upper. Nearest → 1000000.
    assert.equal(out('round(999999, 100)'), '1000000');
    // -999999 / 100 = -9999.99: candidates {-1000000, -999900}. Distances:
    // |-999999 - -1000000| = 1, |-999900 - -999999| = 99 → lower (-1000000) closer.
    assert.equal(out('round(-999999, 100)'), 'calc(-1000000)');
  });

  test('boundary: abs on -0 collapses to 0 (mkSum drop-zero)', () => {
    // `Math.abs(-0)` is +0; both serialize as `0`.
    assert.equal(out('abs(-0)'), '0');
    assert.equal(out('abs(calc(-0))'), '0');
  });

  test('boundary: sign on -0 (JS sign returns -0; both render as 0)', () => {
    // Math.sign(-0) === -0 (JS quirk). Serialize to "0" (Number(-0).toString()).
    assert.equal(out('sign(-0)'), '0');
    assert.equal(out('sign(0)'), '0');
  });

  test('boundary: abs on infinity / NaN', () => {
    assert.equal(out('abs(infinity)'), 'calc(infinity)');
    assert.equal(out('abs(calc(0 - infinity))'), 'calc(infinity)');
    assert.equal(out('abs(NaN)'), 'calc(NaN)');
  });

  test('boundary: sign on infinity / NaN', () => {
    assert.equal(out('sign(infinity)'), '1');
    assert.equal(out('sign(calc(0 - infinity))'), 'calc(-1)');
    assert.equal(out('sign(NaN)'), 'calc(NaN)');
  });

  test('boundary: mod where A === B → 0', () => {
    // mod(5,5) = 5 - 5*floor(1) = 0; mod(-5,-5) = -5 - (-5)*1 = 0 (positive
    // zero — JS arithmetic: -5 - (-5) = -5 + 5 = +0).
    assert.equal(out('mod(5, 5)'), '0');
    assert.equal(out('mod(-5, -5)'), '0');
    assert.equal(out('mod(5px, 5px)'), '0px');
  });

  test('boundary: rem where A === B → 0', () => {
    assert.equal(out('rem(5, 5)'), '0');
    assert.equal(out('rem(-5, -5)'), '0');
  });

  test('boundary: mod where A === -B → 0 (sign cancels)', () => {
    // mod(5, -5): A - B*floor(A/B) = 5 - (-5)*floor(-1) = 5 - (-5)*-1 = 5-5 = 0.
    // mod(-5, 5): -5 - 5*floor(-1) = -5 - 5*-1 = 0.
    assert.equal(out('mod(5, -5)'), '0');
    assert.equal(out('mod(-5, 5)'), '0');
  });

  test('boundary: round/mod/rem with FP-imprecise decimals', () => {
    // 0.1 + 0.2 ≠ 0.3 in FP. But our parser reads `0.3` directly as 0.3.
    // mod(0.3, 0.1) is exactly 0 in math but FP gives ~0.09999... or 0.
    // We don't assert a specific value — only that it folds without throwing
    // and the result has type number.
    const result = out('mod(0.3, 0.1)');
    assert.match(
      result,
      /^calc\(-?(?:\d+|\.\d+)\)$/,
      `expected a numeric output, got ${result}`
    );
  });

  test('boundary: dimensional 0 in mod/rem keeps unit', () => {
    // §10.10: zero-valued buckets keep type info.
    assert.equal(out('mod(0px, 5px)'), '0px');
    assert.equal(out('rem(0px, 5px)'), '0px');
    assert.equal(out('mod(0deg, 90deg)'), '0deg');
  });
});
