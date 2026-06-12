// Naive reference oracle. Hand-written "dumb" implementations of the
// stepped-value / sign-related math, deliberately structured differently
// from `simplify.ts` so that a shared bug would have to manifest in two
// different shapes — much less likely than each oracle replicating the
// same mistake.
//
// We assert agreement on a curated input table. The table targets the
// values that historically break math implementations (signed zeros, ties,
// FP-imprecise decimals, near-zero, near-bound) instead of relying on
// random gen to roll them.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tokenize } from '../../../lib/tokenizer.js';
import { parse } from '../../../lib/parser.js';
import { simplify } from '../../../lib/simplify.js';
import { serialize } from '../../../lib/serialize.js';

const out = (s: string): string =>
  serialize(simplify(parse(tokenize(s))), { precision: 10 });

// --- Naive reference impls ----------------------------------------------
//
// These use a *different* algorithmic shape from `simplify.ts`:
//   - naiveRound normalizes B to |B| and dispatches on strategy with
//     direct Math.{ceil,floor,trunc}; the production code computes both
//     candidates first and picks via min/max + abs comparisons.
//   - naiveMod uses iterative subtraction (capped); the production code
//     uses A − B·floor(A/B).
//   - naiveRem uses A − B·trunc(A/B) directly (same as prod) — kept for
//     completeness but won't catch shape bugs.

function naiveRound(
  strategy: 'nearest' | 'up' | 'down' | 'to-zero',
  a: number,
  b: number
): number {
  if (b === 0) return NaN;
  if (!isFinite(b)) return NaN; // out of scope here; production passthroughs
  if (!isFinite(a)) return a; // §10.3.1 line 1022
  const absB = Math.abs(b);
  const q = a / absB;
  const fl = Math.floor(q);
  const ce = Math.ceil(q);
  if (fl === ce) return a; // exact multiple
  const lower = fl * absB; // closer to -∞
  const upper = ce * absB; // closer to +∞
  switch (strategy) {
    case 'up':
      return upper;
    case 'down':
      return lower;
    case 'to-zero':
      // The candidate with smaller absolute value.
      return Math.abs(lower) <= Math.abs(upper) ? lower : upper;
    case 'nearest': {
      const dl = a - lower;
      const du = upper - a;
      if (dl < du) return lower;
      if (du < dl) return upper;
      return upper; // tie → upper, §10.3 line 978
    }
  }
}

function naiveMod(a: number, b: number): number {
  if (b === 0) return NaN;
  if (!isFinite(a)) return NaN;
  if (!isFinite(b)) {
    if (a !== 0 && Math.sign(a) !== Math.sign(b)) return NaN;
    return a;
  }
  // Iterative reduction: keep adding/subtracting B until r is in the
  // sign-of-B half-open interval [0, |B|) when B > 0, or (-|B|, 0] when B < 0.
  // Capped at 100k iterations — adequate for the test table.
  let r = a;
  let i = 0;
  if (b > 0) {
    while (r >= b && i++ < 100000) r -= b;
    while (r < 0 && i++ < 100000) r += b;
  } else {
    while (r <= b && i++ < 100000) r -= b;
    while (r > 0 && i++ < 100000) r += b;
  }
  return r;
}

function naiveRem(a: number, b: number): number {
  if (b === 0) return NaN;
  if (!isFinite(a)) return NaN;
  if (!isFinite(b)) return a;
  return a - b * Math.trunc(a / b);
}

// --- Curated input table -------------------------------------------------
//
// Each row is a (description, A, B) tuple. We run all four round
// strategies, mod, and rem on each row, and assert the production
// simplifier's output matches the naive oracle.

interface Row {
  desc: string;
  a: number;
  b: number;
}

const rows: Row[] = [
  // Exact multiples
  { desc: 'exact multiple', a: 20, b: 10 },
  { desc: 'exact multiple negative', a: -30, b: 10 },
  { desc: 'zero A', a: 0, b: 10 },
  { desc: 'A === B', a: 5, b: 5 },
  { desc: 'A === -B', a: 5, b: -5 },
  // Ties
  { desc: 'tie midpoint positive', a: 15, b: 10 },
  { desc: 'tie midpoint negative', a: -15, b: 10 },
  { desc: 'tie at small step', a: 0.5, b: 1 },
  { desc: 'tie negative small', a: -0.5, b: 1 },
  // Near-tie (just below / just above)
  { desc: 'just below tie', a: 4.9, b: 10 },
  { desc: 'just above tie', a: 5.1, b: 10 },
  { desc: 'just below tie negative', a: -4.9, b: 10 },
  { desc: 'just above tie negative', a: -5.1, b: 10 },
  // Negative B
  { desc: 'negative B with positive A', a: 7, b: -5 },
  { desc: 'negative B with negative A', a: -7, b: -5 },
  { desc: 'negative B with tie', a: 15, b: -10 },
  // Small B
  { desc: 'small B', a: 0.5, b: 0.1 },
  { desc: 'small B exact', a: 0.3, b: 0.1 },
  // Large B (B much larger than A)
  { desc: 'B much larger than A positive', a: 0.001, b: 1000 },
  { desc: 'B much larger than A negative', a: -0.001, b: 1000 },
  // Mid-range
  { desc: 'positive mid', a: 18, b: 5 },
  { desc: 'negative-A positive-B', a: -18, b: 5 },
  { desc: 'positive-A negative-B', a: 140, b: -90 },
  { desc: 'negative-A negative-B', a: -140, b: -90 },
];

// --- Round agreement -----------------------------------------------------

const STRATEGIES = ['nearest', 'up', 'down', 'to-zero'] as const;

for (const row of rows) {
  for (const strategy of STRATEGIES) {
    test(`oracle: round(${strategy}, ${row.a}, ${row.b}) [${row.desc}]`, () => {
      const expected = naiveRound(strategy, row.a, row.b);
      const got = parseFloat(
        out(`round(${strategy}, ${row.a}, ${row.b})`)
      );
      // NaN === NaN check via Object.is.
      if (Number.isNaN(expected)) {
        assert.ok(Number.isNaN(got), `expected NaN, got ${got}`);
      } else {
        // Allow tiny FP drift between algorithm shapes.
        assert.ok(
          Math.abs(expected - got) < 1e-9,
          `naive=${expected}, prod=${got}`
        );
      }
    });
  }
}

// --- Mod / rem agreement -------------------------------------------------

for (const row of rows) {
  // naiveMod loop bound ~ |a|/|b|; cap to keep tests fast.
  if (row.b !== 0 && Math.abs(row.a / row.b) > 100000) continue;

  test(`oracle: mod(${row.a}, ${row.b}) [${row.desc}]`, () => {
    const expected = naiveMod(row.a, row.b);
    const got = parseFloat(out(`mod(${row.a}, ${row.b})`));
    if (Number.isNaN(expected)) {
      assert.ok(Number.isNaN(got), `expected NaN, got ${got}`);
    } else {
      assert.ok(
        Math.abs(expected - got) < 1e-9,
        `naive=${expected}, prod=${got}`
      );
    }
  });

  test(`oracle: rem(${row.a}, ${row.b}) [${row.desc}]`, () => {
    const expected = naiveRem(row.a, row.b);
    const got = parseFloat(out(`rem(${row.a}, ${row.b})`));
    if (Number.isNaN(expected)) {
      assert.ok(Number.isNaN(got), `expected NaN, got ${got}`);
    } else {
      assert.ok(
        Math.abs(expected - got) < 1e-9,
        `naive=${expected}, prod=${got}`
      );
    }
  });
}

// --- abs / sign — small but covers signed zero -------------------------

const SIGN_INPUTS = [0, -0, 1, -1, 5, -5, 100, -100, 0.0001, -0.0001];

for (const a of SIGN_INPUTS) {
  test(`oracle: abs(${a})`, () => {
    const expected = Math.abs(a);
    const got = parseFloat(out(`abs(${a})`));
    assert.equal(got, expected);
  });

  test(`oracle: sign(${a})`, () => {
    // Math.sign(-0) === -0; we serialize that as "0". Compare via
    // `+got === +expected` to fold ±0.
    const expected = Math.sign(a);
    const got = parseFloat(out(`sign(${a})`));
    assert.ok(+got === +expected, `naive=${expected}, prod=${got}`);
  });
}

// --- trig oracle (§10.4) -------------------------------------------------
//
// Curated angles in radians (since simplifier accepts bare numbers as
// radians per §10.4 line 1044). Each trig function is checked against
// Math.* directly. Inverse functions: production returns degrees, oracle
// is in radians — convert before comparing.

const TRIG_RADIAN_INPUTS = [
  0, 1, -1,
  Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2,
  -Math.PI / 6, -Math.PI / 4, -Math.PI / 3, -Math.PI / 2,
  Math.PI, -Math.PI,
  2 * Math.PI, -2 * Math.PI,
];

for (const x of TRIG_RADIAN_INPUTS) {
  test(`oracle: sin(${x}) [radians]`, () => {
    const expected = Math.sin(x);
    const got = parseFloat(out(`sin(${x})`));
    assert.ok(
      Math.abs(got - expected) < 1e-9,
      `naive=${expected}, prod=${got}`
    );
  });

  test(`oracle: cos(${x}) [radians]`, () => {
    const expected = Math.cos(x);
    const got = parseFloat(out(`cos(${x})`));
    assert.ok(
      Math.abs(got - expected) < 1e-9,
      `naive=${expected}, prod=${got}`
    );
  });

  test(`oracle: tan(${x}) [radians, may be near-asymptote]`, () => {
    const expected = Math.tan(x);
    const got = parseFloat(out(`tan(${x})`));
    // tan diverges near ±π/2; compare via relative error there.
    if (Math.abs(expected) > 1e6) {
      // Both sides should be huge and the same sign — exact match
      // unrealistic, but they should at least agree to within 1%.
      const rel = Math.abs((got - expected) / expected);
      assert.ok(rel < 1e-2, `naive=${expected}, prod=${got}`);
    } else {
      assert.ok(
        Math.abs(got - expected) < 1e-9,
        `naive=${expected}, prod=${got}`
      );
    }
  });
}

// asin/acos domain is [-1, 1]; atan accepts all reals.
const INVERSE_TRIG_NUMBER_INPUTS = [-1, -0.5, 0, 0.25, 0.5, 0.75, 1];

for (const x of INVERSE_TRIG_NUMBER_INPUTS) {
  test(`oracle: asin(${x})`, () => {
    const expectedDeg = (Math.asin(x) * 180) / Math.PI;
    const got = parseFloat(out(`asin(${x})`));
    assert.ok(
      Math.abs(got - expectedDeg) < 1e-9,
      `naive=${expectedDeg}deg, prod=${got}deg`
    );
  });

  test(`oracle: acos(${x})`, () => {
    const expectedDeg = (Math.acos(x) * 180) / Math.PI;
    const got = parseFloat(out(`acos(${x})`));
    assert.ok(
      Math.abs(got - expectedDeg) < 1e-9,
      `naive=${expectedDeg}deg, prod=${got}deg`
    );
  });
}

const ATAN_INPUTS = [-1000, -1, -0.5, 0, 0.5, 1, 1000];

for (const x of ATAN_INPUTS) {
  test(`oracle: atan(${x})`, () => {
    const expectedDeg = (Math.atan(x) * 180) / Math.PI;
    const got = parseFloat(out(`atan(${x})`));
    assert.ok(
      Math.abs(got - expectedDeg) < 1e-9,
      `naive=${expectedDeg}deg, prod=${got}deg`
    );
  });
}

// atan2: pairs that span the full (-180, 180] range.
const ATAN2_INPUTS: [number, number][] = [
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [2, 1], [-2, 1], [1, 2], [3, -4],
];

for (const [y, x] of ATAN2_INPUTS) {
  test(`oracle: atan2(${y}, ${x})`, () => {
    const expectedDeg = (Math.atan2(y, x) * 180) / Math.PI;
    const got = parseFloat(out(`atan2(${y}, ${x})`));
    assert.ok(
      Math.abs(got - expectedDeg) < 1e-9,
      `naive=${expectedDeg}deg, prod=${got}deg`
    );
  });
}

// --- §10.5 oracle rows for pow / sqrt / exp / log / hypot --------------

const POW_INPUTS: [number, number][] = [
  [2, 3], [2, 0.5], [4, 0.5], [3, 4], [10, 2],
  [-2, 3], [-2, 4], [0, 0], [0, 5], [5, 0],
  [10, -2], [Math.E, 2], [Math.PI, 2],
];

for (const [a, b] of POW_INPUTS) {
  test(`oracle: pow(${a}, ${b})`, () => {
    const expected = Math.pow(a, b);
    const got = parseFloat(out(`pow(${a}, ${b})`));
    assert.ok(
      Math.abs(got - expected) < 1e-9,
      `naive=${expected}, prod=${got}`
    );
  });
}

const SQRT_INPUTS = [0, 1, 2, 4, 9, 16, 25, 100, 0.25];

for (const x of SQRT_INPUTS) {
  test(`oracle: sqrt(${x})`, () => {
    const expected = Math.sqrt(x);
    const got = parseFloat(out(`sqrt(${x})`));
    assert.ok(
      Math.abs(got - expected) < 1e-9,
      `naive=${expected}, prod=${got}`
    );
  });
}

const EXP_INPUTS = [-2, -1, 0, 0.5, 1, 2, 5];

for (const x of EXP_INPUTS) {
  test(`oracle: exp(${x})`, () => {
    const expected = Math.exp(x);
    const got = parseFloat(out(`exp(${x})`));
    assert.ok(
      Math.abs(got - expected) < 1e-6,
      `naive=${expected}, prod=${got}`
    );
  });
}

const LOG1_INPUTS = [1, 2, Math.E, 10, 100, 0.5];

for (const x of LOG1_INPUTS) {
  test(`oracle: log(${x})`, () => {
    const expected = Math.log(x);
    const got = parseFloat(out(`log(${x})`));
    assert.ok(
      Math.abs(got - expected) < 1e-9,
      `naive=${expected}, prod=${got}`
    );
  });
}

const LOG2_INPUTS: [number, number][] = [
  [8, 2], [100, 10], [27, 3], [16, 4], [1024, 2],
];

for (const [a, b] of LOG2_INPUTS) {
  test(`oracle: log(${a}, ${b})`, () => {
    const expected = Math.log(a) / Math.log(b);
    const got = parseFloat(out(`log(${a}, ${b})`));
    assert.ok(
      Math.abs(got - expected) < 1e-9,
      `naive=${expected}, prod=${got}`
    );
  });
}

const HYPOT_INPUTS: number[][] = [
  [3, 4],
  [5, 12],
  [8, 15],
  [1, 1],
  [0, 5],
  [3, 4, 12],
  [-3, 4],
];

for (const args of HYPOT_INPUTS) {
  test(`oracle: hypot(${args.join(', ')})`, () => {
    const expected = Math.hypot(...args);
    const got = parseFloat(out(`hypot(${args.join(', ')})`));
    assert.ok(
      Math.abs(got - expected) < 1e-9,
      `naive=${expected}, prod=${got}`
    );
  });
}
