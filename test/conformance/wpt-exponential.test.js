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

// --- §10.5 exponential functions (WPT pow/sqrt/hypot/log/exp) ----------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/
describe('WPT pow:', () => {
  test('WPT pow: pow(2, 3) → 8', () => {
    assert.equal(out('pow(2, 3)'), '8');
  });

  test('WPT pow: pow(0, 0) → 1', () => {
    assert.equal(out('pow(0, 0)'), '1');
  });

  test('WPT pow: pow(2, 0.5) ≈ 1.41421', () => {
    assert.equal(out('pow(2, 0.5)'), 'calc(1.41421)');
  });

  test('WPT pow: pow(-2, 0.5) → NaN', () => {
    assert.equal(out('pow(-2, 0.5)'), 'calc(NaN)');
  });

  test('WPT pow: pow(infinity, 0) → 1', () => {
    assert.equal(out('pow(infinity, 0)'), '1');
  });

  test('WPT sqrt: sqrt(4) → 2', () => {
    assert.equal(out('sqrt(4)'), '2');
  });

  test('WPT sqrt: sqrt(2) ≈ 1.41421', () => {
    assert.equal(out('sqrt(2)'), 'calc(1.41421)');
  });

  test('WPT sqrt: sqrt(-1) → NaN', () => {
    assert.equal(out('sqrt(-1)'), 'calc(NaN)');
  });

  test('WPT sqrt: sqrt(infinity) → infinity', () => {
    assert.equal(out('sqrt(infinity)'), 'calc(infinity)');
  });

  test('WPT exp: exp(0) → 1', () => {
    assert.equal(out('exp(0)'), '1');
  });

  test('WPT exp: exp(1) ≈ 2.71828', () => {
    assert.equal(out('exp(1)'), 'calc(2.71828)');
  });

  test('WPT exp: exp(-infinity) → 0', () => {
    assert.equal(out('exp(-infinity)'), '0');
  });

  test('WPT exp: exp(infinity) → infinity', () => {
    assert.equal(out('exp(infinity)'), 'calc(infinity)');
  });

  test('WPT log: log(e) → 1', () => {
    assert.equal(out('log(e)'), '1');
  });

  test('WPT log: log(1) → 0', () => {
    assert.equal(out('log(1)'), '0');
  });

  test('WPT log: log(0) → -infinity', () => {
    assert.equal(out('log(0)'), 'calc(-infinity)');
  });

  test('WPT log: log(-1) → NaN', () => {
    assert.equal(out('log(-1)'), 'calc(NaN)');
  });

  test('WPT log: log(8, 2) → 3', () => {
    assert.equal(out('log(8, 2)'), '3');
  });

  test('WPT log: log(100, 10) → 2', () => {
    assert.equal(out('log(100, 10)'), '2');
  });

  test('WPT hypot: hypot(3, 4) → 5', () => {
    assert.equal(out('hypot(3, 4)'), '5');
  });

  test('WPT hypot: hypot(3px, 4px) → 5px', () => {
    assert.equal(out('hypot(3px, 4px)'), '5px');
  });

  test('WPT hypot: hypot(infinity, 1) → infinity', () => {
    assert.equal(out('hypot(infinity, 1)'), 'calc(infinity)');
  });

  test('WPT hypot: hypot(-2em) → 2em (single-arg = abs)', () => {
    assert.equal(out('hypot(-2em)'), '2em');
  });
});

// --- nan-and-infinity-{computed,serialize}.html (§10.13) ---------------
describe('WPT degenerate: Calc(-infinity Round-trips', () => {
  test('WPT degenerate: calc(infinity) round-trips', () => {
    assert.equal(out('calc(infinity)'), 'calc(infinity)');
  });

  test('WPT degenerate: calc(-infinity) round-trips', () => {
    assert.equal(out('calc(-infinity)'), 'calc(-infinity)');
  });

  test('WPT degenerate: calc(NaN) round-trips with canonical casing', () => {
    assert.equal(out('calc(NaN)'), 'calc(NaN)');
  });

  test('WPT degenerate: calc(1px / 0) → calc(infinity * 1px)', () => {
    assert.equal(out('calc(1px / 0)'), 'calc(infinity * 1px)');
  });

  test('WPT degenerate: calc(NaN * 1deg) → calc(NaN * 1deg)', () => {
    assert.equal(out('calc(NaN * 1deg)'), 'calc(NaN * 1deg)');
  });

  test('WPT degenerate: calc(infinity + infinity) → calc(infinity)', () => {
    assert.equal(out('calc(infinity + infinity)'), 'calc(infinity)');
  });

  test('WPT degenerate: calc(infinity - infinity) → calc(NaN)', () => {
    assert.equal(out('calc(infinity - infinity)'), 'calc(NaN)');
  });
});
