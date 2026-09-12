// Algebraic-invariant tests for the stepped-value (round, mod, rem) and
// sign-related (abs, sign) functions. Each test asserts a math law that
// must hold for every input (within the law's domain), independent of
// specific values. Random-gen tests check "does it look right"; these
// check "does it obey the laws math says it must" — different bug class.
//
// Inputs come from small integer / dim leaves. Edge cases (Infinity, NaN,
// zero divisors) are filtered out per-law because most laws require finite
// non-degenerate values.
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { simplify } from '../../src/lib/simplify.js';
import { serialize } from '../../src/lib/serialize.js';
import { call, num } from '../../src/lib/node.js';

const NUM_RUNS = 500;

const out = (n) => serialize(simplify(n), { precision: 10 });
const scalarText = (text) =>
  text.startsWith('calc(') && text.endsWith(')')
    ? text.slice('calc('.length, -1)
    : text;
const numeric = (text) => Number.parseFloat(scalarText(text));

// --- pow / sqrt / log / exp / hypot laws (§10.5) ----------------------
test('law: pow(x, 1) ≡ x for finite x', () => {
  fc.assert(
    fc.property(fc.integer({ min: -1000, max: 1000 }), (v) => {
      const lhs = out(call('pow', [num(v), num(1)]));
      const rhs = out(num(v));
      return lhs === rhs;
    }),
    { numRuns: NUM_RUNS }
  );
});

describe('law: Pow(x 0', () => {
  test('law: pow(x, 0) ≡ 1 for finite x', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (v) => {
        return out(call('pow', [num(v), num(0)])) === '1';
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: sqrt(pow(x, 2)) ≡ abs(x) for finite x', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 100 }), (v) => {
        const lhs = numeric(out(call('sqrt', [call('pow', [num(v), num(2)])])));
        const rhs = Math.abs(v);
        return Math.abs(lhs - rhs) < 1e-9;
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: log(exp(x)) ≡ x for finite x within precision', () => {
    fc.assert(
      fc.property(fc.float({ min: -50, max: 50, noNaN: true }), (v) => {
        const lhs = numeric(out(call('log', [call('exp', [num(v)])])));
        return Math.abs(v) < 1e-12 || Math.abs(lhs - v) < 1e-6;
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: exp(log(x)) ≡ x for finite x > 0 within precision', () => {
    fc.assert(
      fc.property(
        fc.float({
          min: Math.fround(1e-3),
          max: Math.fround(1e6),
          noNaN: true,
        }),
        (v) => {
          const lhs = numeric(out(call('exp', [call('log', [num(v)])])));
          return Math.abs((lhs - v) / v) < 1e-6;
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: hypot(x) ≡ abs(x) for finite x', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (v) => {
        const lhs = out(call('hypot', [num(v)]));
        const rhs = out(call('abs', [num(v)]));
        return lhs === rhs;
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: hypot(3, 4) ≡ 5 (sentinel)', () => {
    if (out(call('hypot', [num(3), num(4)])) !== '5') {
      throw new Error('expected 5');
    }
  });
});
