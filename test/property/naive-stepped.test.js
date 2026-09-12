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
import { tokenize } from '../../src/lib/tokenizer.js';
import { parse } from '../../src/lib/parser.js';
import { simplify } from '../../src/lib/simplify.js';
import { serialize } from '../../src/lib/serialize.js';
const out = (s) => serialize(simplify(parse(tokenize(s))), { precision: 10 });
const scalarText = (text) =>
  text.startsWith('calc(') && text.endsWith(')')
    ? text.slice('calc('.length, -1)
    : text;
const numeric = (text) => Number.parseFloat(scalarText(text));
// --- Naive reference impls ----------------------------------------------
//
// These use a *different* algorithmic shape from `simplify.ts`:
//   - naiveRound normalizes B to |B| and dispatches on strategy with
//     direct Math.{ceil,floor,trunc}; the production code computes both
//     candidates first and picks via min/max + abs comparisons.
//   - naiveMod uses iterative subtraction (capped); the production code
//     uses A − B·floor(A/B).
//   - naiveRem mirrors production's native `%` directly (see below).
function naiveRound(strategy, a, b) {
  if (b === 0) return Number.NaN;
  if (!Number.isFinite(b)) return Number.NaN; // out of scope here; production passthroughs
  if (!Number.isFinite(a)) return a; // §10.3.1 line 1022
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
function naiveMod(a, b) {
  if (b === 0) return Number.NaN;
  if (!Number.isFinite(a)) return Number.NaN;
  if (!Number.isFinite(b)) {
    if (a !== 0 && Math.sign(a) !== Math.sign(b)) return Number.NaN;
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
function naiveRem(a, b) {
  if (b === 0) return Number.NaN;
  if (!Number.isFinite(a)) return Number.NaN;
  if (!Number.isFinite(b)) return a;
  // `%` is exact IEEE-754 remainder; any division-based formula adds its
  // own rounding and disagrees at near-exact-quotient inputs (see [small B]).
  return a % b;
}
const rows = [
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
const STRATEGIES = ['nearest', 'up', 'down', 'to-zero'];
for (const row of rows) {
  for (const strategy of STRATEGIES) {
    test(`oracle: round(${strategy}, ${row.a}, ${row.b}) [${row.desc}]`, () => {
      const expected = naiveRound(strategy, row.a, row.b);
      const got = numeric(out(`round(${strategy}, ${row.a}, ${row.b})`));
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
    const got = numeric(out(`mod(${row.a}, ${row.b})`));
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
    const got = numeric(out(`rem(${row.a}, ${row.b})`));
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
    const got = numeric(out(`abs(${a})`));
    assert.equal(got, expected);
  });
  test(`oracle: sign(${a})`, () => {
    // Math.sign(-0) === -0; we serialize that as "0". Compare via
    // `+got === +expected` to fold ±0.
    const expected = Math.sign(a);
    const got = numeric(out(`sign(${a})`));
    assert.ok(+got === +expected, `naive=${expected}, prod=${got}`);
  });
}
