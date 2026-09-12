// WPT (web-platform-tests) subset cribbed from:
//   https://github.com/web-platform-tests/wpt/tree/master/css/css-values
//
// Each test cites its source file. Cases selected where our output
// matches the spec-defined simplified form without requiring:
//   - Chrome/Firefox's canonical reordering of sum terms (§10.12 step 4),
//   - eager normalization of absolute length units to px (a browser
//     serialization choice, not a spec requirement for calc()),
//   - infinity / NaN serialization (covered when full IEEE-754 fold lands).
//
// Trig (§10.4: sin/cos/tan/asin/acos/atan/atan2) is covered below; the
// exponential family (pow/sqrt/hypot/log/exp) is a planned follow-up.
//
// Divergences are documented with `DIVERGE:` comments.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../helpers/out.js';

// --- sin-cos-tan-computed.html (§10.4) -----------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/sin-cos-tan-computed.html
describe('WPT sin/cos/tan:', () => {
  test('WPT sin/cos/tan: sin(0) → 0', () => {
    assert.equal(out('sin(0)'), '0');
  });

  test('WPT sin/cos/tan: cos(0) → 1', () => {
    assert.equal(out('cos(0)'), '1');
  });

  test('WPT sin/cos/tan: tan(0) → 0', () => {
    assert.equal(out('tan(0)'), '0');
  });

  test('WPT sin/cos/tan: sin(90deg) → 1', () => {
    assert.equal(out('sin(90deg)'), '1');
  });

  test('WPT sin/cos/tan: cos(180deg) → -1', () => {
    assert.equal(out('cos(180deg)'), 'calc(-1)');
  });

  test('WPT sin/cos/tan: tan(45deg) → 1 (rounded from 0.999...)', () => {
    assert.equal(out('tan(45deg)'), '1');
  });

  test('WPT sin/cos/tan: sin(0.25turn) → 1', () => {
    assert.equal(out('sin(0.25turn)'), '1');
  });

  test('WPT sin/cos/tan: cos(100grad) → 0 (rounds to precision 5)', () => {
    // 100grad = 90deg → cos = 6e-17 → rounds to 0.
    assert.equal(out('cos(100grad)'), '0');
  });

  test('WPT sin/cos/tan: bare number is radians — sin(pi / 2) → 1', () => {
    assert.equal(out('sin(pi / 2)'), '1');
  });
});

// --- pi-folding into trig (covered by sin-cos-tan-computed.html cases) ---
// No standalone WPT file exists for "trig with pi"; the upstream
// computed-value tests interleave pi-folding cases with the rest.
describe('WPT trig-pi:', () => {
  test('WPT trig-pi: sin(pi) → 0 (rounds at precision 5)', () => {
    assert.equal(out('sin(pi)'), '0');
  });

  test('WPT trig-pi: cos(pi) → -1', () => {
    assert.equal(out('cos(pi)'), 'calc(-1)');
  });

  test('WPT trig-pi: cos(2 * pi) → 1', () => {
    assert.equal(out('cos(2 * pi)'), '1');
  });

  test('WPT trig-pi: tan(pi / 4) → 1', () => {
    assert.equal(out('tan(pi / 4)'), '1');
  });
});

// --- acos-asin-atan-atan2-computed.html (§10.4) --------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/acos-asin-atan-atan2-computed.html
describe('WPT asin:', () => {
  test('WPT asin: asin(0) → 0deg', () => {
    assert.equal(out('asin(0)'), '0deg');
  });

  test('WPT asin: asin(1) → 90deg', () => {
    assert.equal(out('asin(1)'), '90deg');
  });

  test('WPT asin: asin(-1) → -90deg', () => {
    assert.equal(out('asin(-1)'), 'calc(-90deg)');
  });

  test('WPT acos: acos(1) → 0deg', () => {
    assert.equal(out('acos(1)'), '0deg');
  });

  test('WPT acos: acos(-1) → 180deg', () => {
    assert.equal(out('acos(-1)'), '180deg');
  });

  test('WPT acos: acos(0) → 90deg', () => {
    assert.equal(out('acos(0)'), '90deg');
  });

  test('WPT atan: atan(0) → 0deg', () => {
    assert.equal(out('atan(0)'), '0deg');
  });

  test('WPT atan: atan(1) → 45deg', () => {
    assert.equal(out('atan(1)'), '45deg');
  });

  test('WPT atan: atan(-1) → -45deg', () => {
    assert.equal(out('atan(-1)'), 'calc(-45deg)');
  });

  test('WPT atan: atan(infinity) → 90deg', () => {
    assert.equal(out('atan(infinity)'), '90deg');
  });
});

// --- atan2 cases from acos-asin-atan-atan2-computed.html (§10.4.1) -------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/acos-asin-atan-atan2-computed.html
describe('WPT atan2:', () => {
  test('WPT atan2: atan2(0, 1) → 0deg', () => {
    assert.equal(out('atan2(0, 1)'), '0deg');
  });

  test('WPT atan2: atan2(1, 0) → 90deg', () => {
    assert.equal(out('atan2(1, 0)'), '90deg');
  });

  test('WPT atan2: atan2(0, -1) → 180deg', () => {
    assert.equal(out('atan2(0, -1)'), '180deg');
  });

  test('WPT atan2: atan2(-1, 0) → -90deg', () => {
    assert.equal(out('atan2(-1, 0)'), 'calc(-90deg)');
  });

  test('WPT atan2: atan2(1, 1) → 45deg', () => {
    assert.equal(out('atan2(1, 1)'), '45deg');
  });

  test('WPT atan2: atan2(infinity, infinity) → 45deg (spec table)', () => {
    assert.equal(out('atan2(infinity, infinity)'), '45deg');
  });

  test('WPT atan2: same-unit dim args (1px, 1px) → 45deg', () => {
    assert.equal(out('atan2(1px, 1px)'), '45deg');
  });
});
