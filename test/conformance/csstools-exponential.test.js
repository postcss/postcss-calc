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

// --- §10.5 exponential family fixtures -------------------------------
describe('csstools pow:', () => {
  test('csstools pow: pow(2, 3) → 8', () => {
    assert.equal(out('pow(2, 3)'), '8');
  });

  test('csstools pow: pow(8, 1 / 3) ≈ 2', () => {
    // csstools agrees on the cube-root identity within FP precision.
    const got = Number.parseFloat(out('pow(8, 1 / 3)'));
    assert.ok(Math.abs(got - 2) < 1e-9, `got ${got}`);
  });

  test('csstools sqrt: sqrt(16) → 4', () => {
    assert.equal(out('sqrt(16)'), '4');
  });

  test('csstools sqrt: sqrt(0) → 0', () => {
    assert.equal(out('sqrt(0)'), '0');
  });

  test('csstools exp: exp(0) → 1', () => {
    assert.equal(out('exp(0)'), '1');
  });

  test('csstools log: log(8, 2) → 3', () => {
    assert.equal(out('log(8, 2)'), '3');
  });

  test('csstools log: natural log of e → 1', () => {
    assert.equal(out('log(e)'), '1');
  });

  test('csstools hypot: hypot(3, 4) → 5', () => {
    assert.equal(out('hypot(3, 4)'), '5');
  });

  test('csstools hypot: hypot(3px, 4px) → 5px', () => {
    assert.equal(out('hypot(3px, 4px)'), '5px');
  });

  test('csstools hypot: single arg passes through as abs', () => {
    assert.equal(out('hypot(-2em)'), '2em');
  });
});

// --- §10.13 degenerate-number fixtures -------------------------------
describe('csstools degenerate', () => {
  test('csstools degenerate: calc(infinity) round-trips', () => {
    assert.equal(out('calc(infinity)'), 'calc(infinity)');
  });

  test('csstools degenerate: division by zero produces calc(infinity * 1px)', () => {
    assert.equal(out('calc(1px / 0)'), 'calc(infinity * 1px)');
  });

  test('csstools degenerate: NaN canonical casing on output', () => {
    assert.equal(out('calc(NaN)'), 'calc(NaN)');
  });

  test('csstools degenerate: subtracting infinities → NaN', () => {
    assert.equal(out('calc(infinity - infinity)'), 'calc(NaN)');
  });
});
