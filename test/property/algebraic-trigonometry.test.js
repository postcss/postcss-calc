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

// --- trig laws (§10.4) ---------------------------------------------------
//
// Curated angles where the spec values are exact (or close enough that
// precision: 10 lands cleanly). Random ranges where the law tolerates
// floating-point drift use approximate equality (`< 1e-9`) — string
// comparison can't survive Math.sin asymptote noise.
const FLOAT_RANGE = { min: -1000, max: 1000, noNaN: true };

const finiteFloat = fc.float(FLOAT_RANGE);

const CURATED_ANGLES = [
  0,
  1,
  -1,
  Math.PI / 4,
  -Math.PI / 4,
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI,
  -Math.PI,
  2 * Math.PI,
  -2 * Math.PI,
];

describe('law: Sin Is', () => {
  test('law: sin is odd — sin(-x) ≡ -sin(x) for curated angles', () => {
    for (const x of CURATED_ANGLES) {
      const lhs = numeric(out(call('sin', [num(-x)])));
      const rhs = -numeric(out(call('sin', [num(x)])));
      if (Math.abs(lhs - rhs) > 1e-9) {
        throw new Error(`sin(-${x}) (${lhs}) ≠ -sin(${x}) (${rhs})`);
      }
    }
  });

  test('law: cos is even — cos(-x) ≡ cos(x) for curated angles', () => {
    for (const x of CURATED_ANGLES) {
      const lhs = numeric(out(call('cos', [num(-x)])));
      const rhs = numeric(out(call('cos', [num(x)])));
      if (Math.abs(lhs - rhs) > 1e-9) {
        throw new Error(`cos(-${x}) (${lhs}) ≠ cos(${x}) (${rhs})`);
      }
    }
  });

  test('law: tan(0) ≡ 0; atan(0) ≡ 0deg; atan(1) ≡ 45deg', () => {
    if (out(call('tan', [num(0)])) !== '0') throw new Error('tan(0) ≠ 0');
    if (out(call('atan', [num(0)])) !== '0deg')
      throw new Error('atan(0) ≠ 0deg');
    if (out(call('atan', [num(1)])) !== '45deg')
      throw new Error('atan(1) ≠ 45deg');
  });

  test('law: sin² + cos² ≡ 1 over a finite range (away from asymptotes)', () => {
    fc.assert(
      fc.property(finiteFloat, (x) => {
        const s = numeric(out(call('sin', [num(x)])));
        const c = numeric(out(call('cos', [num(x)])));
        return Math.abs(s * s + c * c - 1) < 1e-9;
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: asin(sin(x)) ≡ x for x ∈ [-π/2 + 0.05, π/2 − 0.05]', () => {
    // Inset slightly from the boundary: asin's derivative blows up at ±1
    // (slope of asin is 1/sqrt(1−x²)), so x within 0.05 rad of ±π/2 is the
    // domain where round-trip through the precision-10 serializer drifts
    // beyond 1e-6.
    const principalRange = fc.float({
      min: Math.fround(-Math.PI / 2 + 0.05),
      max: Math.fround(Math.PI / 2 - 0.05),
      noNaN: true,
    });
    fc.assert(
      fc.property(principalRange, (x) => {
        const s = numeric(out(call('sin', [num(x)])));
        const aDeg = numeric(out(call('asin', [num(s)])));
        const aRad = (aDeg * Math.PI) / 180;
        return Math.abs(aRad - x) < 1e-6;
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: atan2(sin(θ), cos(θ)) ≡ θ (in degrees) for θ ∈ (-180, 180]', () => {
    fc.assert(
      fc.property(fc.float({ min: -179, max: 180, noNaN: true }), (degRaw) => {
        const theta = (degRaw * Math.PI) / 180;
        const s = numeric(out(call('sin', [num(theta)])));
        const c = numeric(out(call('cos', [num(theta)])));
        const recovered = numeric(out(call('atan2', [num(s), num(c)])));
        return Math.abs(recovered - degRaw) < 1e-6;
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: atan2 only depends on the ratio — atan2(k·y, k·x) ≡ atan2(y, x), k > 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (y, x, k) => {
          if (x === 0 && y === 0) return true; // atan2(0,0) is degenerate
          const lhs = numeric(out(call('atan2', [num(k * y), num(k * x)])));
          const rhs = numeric(out(call('atan2', [num(y), num(x)])));
          return Math.abs(lhs - rhs) < 1e-9;
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
