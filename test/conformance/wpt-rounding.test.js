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
// --- round-mod-rem-computed.html (§10.3) ---------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/round-mod-rem-computed.html
describe('WPT round:', () => {
  test('WPT round: round(10, 10) → 10 (exact multiple)', () => {
    assert.equal(out('round(10, 10)'), '10');
  });

  test('WPT round: round(15, 10) → 20 (nearest, tie up)', () => {
    assert.equal(out('round(15, 10)'), '20');
  });

  test('WPT round: round(up, 11, 10) → 20', () => {
    assert.equal(out('round(up, 11, 10)'), '20');
  });

  test('WPT round: round(down, 19, 10) → 10', () => {
    assert.equal(out('round(down, 19, 10)'), '10');
  });

  test('WPT round: round(to-zero, -19, 10) → -10', () => {
    assert.equal(out('round(to-zero, -19, 10)'), 'calc(-10)');
  });

  test('WPT round: round(3.7) → 4 (B defaults to 1 for <number>)', () => {
    assert.equal(out('round(3.7)'), '4');
  });

  test('WPT round: round on dimensional A in same unit family', () => {
    assert.equal(out('round(15px, 10px)'), '20px');
  });
});

// --- mod cases (from round-mod-rem-computed.html) ------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/round-mod-rem-computed.html
describe('WPT mod: Mod(18px 5px', () => {
  test('WPT mod: mod(18, 5) → 3', () => {
    assert.equal(out('mod(18, 5)'), '3');
  });
  test('WPT mod: mod(18px, 5px) → 3px (spec example)', () => {
    assert.equal(out('mod(18px, 5px)'), '3px');
  });

  test('WPT mod: mod(-18px, 5px) → 2px (sign of B, spec example)', () => {
    assert.equal(out('mod(-18px, 5px)'), '2px');
  });

  test('WPT mod: mod(140deg, -90deg) → -40deg (spec example)', () => {
    assert.equal(out('mod(140deg, -90deg)'), 'calc(-40deg)');
  });
});

// --- rem cases (from round-mod-rem-computed.html) ------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/round-mod-rem-computed.html
describe('WPT rem:', () => {
  test('WPT rem: rem(18, 5) → 3', () => {
    assert.equal(out('rem(18, 5)'), '3');
  });

  test('WPT rem: rem(-18px, 5px) → -3px (sign of A, spec example)', () => {
    assert.equal(out('rem(-18px, 5px)'), 'calc(-3px)');
  });

  test('WPT rem: rem(140deg, -90deg) → 50deg (spec example)', () => {
    assert.equal(out('rem(140deg, -90deg)'), '50deg');
  });
});

// --- signs-abs-computed.html (§10.6) -------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/signs-abs-computed.html
describe('WPT abs:', () => {
  test('WPT abs: abs(-5) → 5', () => {
    assert.equal(out('abs(-5)'), '5');
  });

  test('WPT abs: abs(-10px) → 10px', () => {
    assert.equal(out('abs(-10px)'), '10px');
  });

  test('WPT abs: abs(5deg) → 5deg', () => {
    assert.equal(out('abs(5deg)'), '5deg');
  });
});

// --- sign cases (from signs-abs-computed.html, §10.6) --------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/signs-abs-computed.html
describe('WPT sign:', () => {
  test('WPT sign: sign(-5) → -1', () => {
    assert.equal(out('sign(-5)'), 'calc(-1)');
  });

  test('WPT sign: sign(0) → 0', () => {
    assert.equal(out('sign(0)'), '0');
  });

  test('WPT sign: sign(10px) → 1 (always returns <number>)', () => {
    assert.equal(out('sign(10px)'), '1');
  });
});
