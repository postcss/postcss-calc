// Algebraic-invariant tests for the stepped-value (round, mod, rem) and
// sign-related (abs, sign) functions. Each test asserts a math law that
// must hold for every input (within the law's domain), independent of
// specific values. Random-gen tests check "does it look right"; these
// check "does it obey the laws math says it must" — different bug class.
//
// Inputs come from small integer / dim leaves. Edge cases (Infinity, NaN,
// zero divisors) are filtered out per-law because most laws require finite
// non-degenerate values.
import { test } from 'node:test';
import fc from 'fast-check';
import { simplify } from '../../src/lib/simplify.js';
import { serialize } from '../../src/lib/serialize.js';
const NUM_RUNS = 500;
const out = (n) => serialize(simplify(n), { precision: 10 });
const call = (name, args) => ({ type: 'Call', name, args });
const num = (v) => ({ type: 'Num', value: v });
const dim = (v, u) => ({ type: 'Dim', value: v, unit: u });
const ident = (n) => ({ type: 'Ident', name: n });
// Finite, non-zero numeric leaf — domain for most laws.
const finiteNum = fc.integer({ min: -1000, max: 1000 }).map(num);
const finiteNonzeroNum = fc
  .integer({ min: -1000, max: 1000 })
  .filter((v) => v !== 0)
  .map(num);
const positiveNum = fc.integer({ min: 1, max: 1000 }).map(num);
// Same-unit dim pair (so foldConstArgs works without conversion noise).
const SAME_UNIT_DIMS = ['px', 'em', 'deg', 's', 'rem'];
const finiteDim = fc
  .tuple(
    fc.integer({ min: -1000, max: 1000 }),
    fc.constantFrom(...SAME_UNIT_DIMS)
  )
  .map(([v, u]) => ({ type: 'Dim', value: v, unit: u }));
const finiteLeaf = fc.oneof(finiteNum, finiteDim);
// --- abs / sign laws -----------------------------------------------------
test('law: abs is idempotent — abs(abs(x)) ≡ abs(x)', () => {
  fc.assert(
    fc.property(finiteLeaf, (x) => {
      const lhs = out(call('abs', [call('abs', [x])]));
      const rhs = out(call('abs', [x]));
      return lhs === rhs;
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: abs is even — abs(-x) ≡ abs(x)', () => {
  fc.assert(
    fc.property(finiteLeaf, (x) => {
      const negX = x.type === 'Num' ? num(-x.value) : dim(-x.value, x.unit);
      return out(call('abs', [negX])) === out(call('abs', [x]));
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: abs(x) is non-negative for finite x', () => {
  fc.assert(
    fc.property(finiteLeaf, (x) => {
      const absStr = out(call('abs', [x]));
      // Output is `<number>` or `<value><unit>`; never starts with `-`.
      return !absStr.startsWith('-');
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: sign is idempotent on its codomain — sign(sign(x)) ≡ sign(x)', () => {
  fc.assert(
    fc.property(finiteLeaf, (x) => {
      const inner = out(call('sign', [x]));
      // sign(x) returns a bare number in {-1, 0, 1}; sign of that is the
      // same number.
      const outer = out(call('sign', [num(parseFloat(inner))]));
      return inner === outer;
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: sign is odd — sign(-x) ≡ -sign(x) (when x ≠ 0)', () => {
  fc.assert(
    fc.property(finiteNonzeroNum, (x) => {
      const negX = num(-x.value);
      const lhs = parseFloat(out(call('sign', [negX])));
      const rhs = -parseFloat(out(call('sign', [x])));
      return Object.is(lhs, rhs) || lhs === rhs;
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: abs(x) * sign(x) ≡ x — for finite numeric x', () => {
  fc.assert(
    fc.property(finiteNonzeroNum, (x) => {
      const a = parseFloat(out(call('abs', [x])));
      const s = parseFloat(out(call('sign', [x])));
      return a * s === x.value;
    }),
    { numRuns: NUM_RUNS }
  );
});
// --- round laws ----------------------------------------------------------
test('law: round is idempotent on the same step — round(round(x, B), B) ≡ round(x, B)', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('nearest', 'up', 'down', 'to-zero'),
      finiteNum,
      positiveNum,
      (strategy, x, b) => {
        const inner = call('round', [ident(strategy), x, b]);
        const once = out(inner);
        const twice = out(
          call('round', [ident(strategy), num(parseFloat(once)), b])
        );
        return once === twice;
      }
    ),
    { numRuns: NUM_RUNS }
  );
});
test('law: round monotone in strategy — up ≥ nearest ≥ down', () => {
  fc.assert(
    fc.property(finiteNum, positiveNum, (x, b) => {
      const up = parseFloat(out(call('round', [ident('up'), x, b])));
      const nearest = parseFloat(out(call('round', [ident('nearest'), x, b])));
      const down = parseFloat(out(call('round', [ident('down'), x, b])));
      return up >= nearest && nearest >= down;
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: round to-zero ∈ {up, down} and minimizes |result|', () => {
  fc.assert(
    fc.property(finiteNum, positiveNum, (x, b) => {
      const up = parseFloat(out(call('round', [ident('up'), x, b])));
      const down = parseFloat(out(call('round', [ident('down'), x, b])));
      const tz = parseFloat(out(call('round', [ident('to-zero'), x, b])));
      const inSet = tz === up || tz === down;
      const minimal =
        Math.abs(tz) <= Math.abs(up) && Math.abs(tz) <= Math.abs(down);
      return inSet && minimal;
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: round result is on the B-grid — (result / B) is integer', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('nearest', 'up', 'down', 'to-zero'),
      finiteNum,
      positiveNum,
      (strategy, x, b) => {
        const r = parseFloat(out(call('round', [ident(strategy), x, b])));
        const q = r / b.value;
        // Allow tiny FP drift: integer means q ≡ round(q) within EPSILON.
        return Math.abs(q - Math.round(q)) < 1e-9;
      }
    ),
    { numRuns: NUM_RUNS }
  );
});
test('law: round result is within B of A — |round(x, B) − x| ≤ B', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('nearest', 'up', 'down', 'to-zero'),
      finiteNum,
      positiveNum,
      (strategy, x, b) => {
        const r = parseFloat(out(call('round', [ident(strategy), x, b])));
        return Math.abs(r - x.value) <= b.value + 1e-9;
      }
    ),
    { numRuns: NUM_RUNS }
  );
});
test('law: nearest minimizes |result − x| (with tie → upper)', () => {
  fc.assert(
    fc.property(finiteNum, positiveNum, (x, b) => {
      const up = parseFloat(out(call('round', [ident('up'), x, b])));
      const down = parseFloat(out(call('round', [ident('down'), x, b])));
      const nearest = parseFloat(out(call('round', [ident('nearest'), x, b])));
      const dUp = Math.abs(up - x.value);
      const dDown = Math.abs(down - x.value);
      return dUp <= dDown ? nearest === up : nearest === down;
    }),
    { numRuns: NUM_RUNS }
  );
});
// --- mod / rem laws ------------------------------------------------------
test('law: mod range — 0 ≤ mod(x, B) < B (for B > 0, finite x)', () => {
  fc.assert(
    fc.property(finiteNum, positiveNum, (x, b) => {
      const r = parseFloat(out(call('mod', [x, b])));
      return r >= 0 && r < b.value;
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: rem range — |rem(x, B)| < B (for B > 0, finite x)', () => {
  fc.assert(
    fc.property(finiteNum, positiveNum, (x, b) => {
      const r = parseFloat(out(call('rem', [x, b])));
      return Math.abs(r) < b.value;
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: rem sign follows dividend — sign(rem(x, B)) ∈ {sign(x), 0}', () => {
  fc.assert(
    fc.property(finiteNum, positiveNum, (x, b) => {
      const r = parseFloat(out(call('rem', [x, b])));
      if (r === 0) return true;
      return Math.sign(r) === Math.sign(x.value);
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: mod periodicity — mod(x + B, B) ≡ mod(x, B)', () => {
  fc.assert(
    fc.property(finiteNum, positiveNum, (x, b) => {
      const lhs = parseFloat(out(call('mod', [num(x.value + b.value), b])));
      const rhs = parseFloat(out(call('mod', [x, b])));
      return Math.abs(lhs - rhs) < 1e-9;
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: spec line 1017 — rem(A, B) ≡ A − round(to-zero, A, B)', () => {
  fc.assert(
    fc.property(finiteNum, positiveNum, (a, b) => {
      const lhs = parseFloat(out(call('rem', [a, b])));
      const r = parseFloat(out(call('round', [ident('to-zero'), a, b])));
      const rhs = a.value - r;
      return Math.abs(lhs - rhs) < 1e-9;
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: spec line 1017 — mod(A, B) ≡ A − round(down, A, B) (for B > 0)', () => {
  // Spec gives the general form mod(A, B) = A − sign(B)*round(down, A*sign(B), B).
  // For B > 0 this reduces to mod(A, B) = A − round(down, A, B).
  fc.assert(
    fc.property(finiteNum, positiveNum, (a, b) => {
      const lhs = parseFloat(out(call('mod', [a, b])));
      const r = parseFloat(out(call('round', [ident('down'), a, b])));
      const rhs = a.value - r;
      return Math.abs(lhs - rhs) < 1e-9;
    }),
    { numRuns: NUM_RUNS }
  );
});
// --- Cross-function and metamorphic ---------------------------------------
test('metamorphic: round scales — round(k·x, k·B) ≡ k·round(x, B), k > 0', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('nearest', 'up', 'down', 'to-zero'),
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 1, max: 10 }),
      (strategy, xRaw, bRaw, k) => {
        const lhs = parseFloat(
          out(call('round', [ident(strategy), num(k * xRaw), num(k * bRaw)]))
        );
        const inner = parseFloat(
          out(call('round', [ident(strategy), num(xRaw), num(bRaw)]))
        );
        const rhs = k * inner;
        return Math.abs(lhs - rhs) < 1e-6;
      }
    ),
    { numRuns: NUM_RUNS }
  );
});
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
test('law: sin is odd — sin(-x) ≡ -sin(x) for curated angles', () => {
  for (const x of CURATED_ANGLES) {
    const lhs = parseFloat(out(call('sin', [num(-x)])));
    const rhs = -parseFloat(out(call('sin', [num(x)])));
    if (Math.abs(lhs - rhs) > 1e-9) {
      throw new Error(`sin(-${x}) (${lhs}) ≠ -sin(${x}) (${rhs})`);
    }
  }
});
test('law: cos is even — cos(-x) ≡ cos(x) for curated angles', () => {
  for (const x of CURATED_ANGLES) {
    const lhs = parseFloat(out(call('cos', [num(-x)])));
    const rhs = parseFloat(out(call('cos', [num(x)])));
    if (Math.abs(lhs - rhs) > 1e-9) {
      throw new Error(`cos(-${x}) (${lhs}) ≠ cos(${x}) (${rhs})`);
    }
  }
});
test('law: tan(0) ≡ 0; atan(0) ≡ 0deg; atan(1) ≡ 45deg', () => {
  if (out(call('tan', [num(0)])) !== '0') throw new Error('tan(0) ≠ 0');
  if (out(call('atan', [num(0)])) !== '0deg') throw new Error('atan(0) ≠ 0deg');
  if (out(call('atan', [num(1)])) !== '45deg')
    throw new Error('atan(1) ≠ 45deg');
});
test('law: sin² + cos² ≡ 1 over a finite range (away from asymptotes)', () => {
  fc.assert(
    fc.property(finiteFloat, (x) => {
      const s = parseFloat(out(call('sin', [num(x)])));
      const c = parseFloat(out(call('cos', [num(x)])));
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
      const s = parseFloat(out(call('sin', [num(x)])));
      const aDeg = parseFloat(out(call('asin', [num(s)])));
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
      const s = parseFloat(out(call('sin', [num(theta)])));
      const c = parseFloat(out(call('cos', [num(theta)])));
      const recovered = parseFloat(out(call('atan2', [num(s), num(c)])));
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
        const lhs = parseFloat(out(call('atan2', [num(k * y), num(k * x)])));
        const rhs = parseFloat(out(call('atan2', [num(y), num(x)])));
        return Math.abs(lhs - rhs) < 1e-9;
      }
    ),
    { numRuns: NUM_RUNS }
  );
});
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
      const lhs = parseFloat(
        out(call('sqrt', [call('pow', [num(v), num(2)])]))
      );
      const rhs = Math.abs(v);
      return Math.abs(lhs - rhs) < 1e-9;
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: log(exp(x)) ≡ x for finite x within precision', () => {
  fc.assert(
    fc.property(fc.float({ min: -50, max: 50, noNaN: true }), (v) => {
      const lhs = parseFloat(out(call('log', [call('exp', [num(v)])])));
      return Math.abs(lhs - v) < 1e-6;
    }),
    { numRuns: NUM_RUNS }
  );
});
test('law: exp(log(x)) ≡ x for finite x > 0 within precision', () => {
  fc.assert(
    fc.property(
      fc.float({ min: Math.fround(1e-3), max: Math.fround(1e6), noNaN: true }),
      (v) => {
        const lhs = parseFloat(out(call('exp', [call('log', [num(v)])])));
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
