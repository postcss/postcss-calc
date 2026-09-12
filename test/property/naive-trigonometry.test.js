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
// --- trig oracle (§10.4) -------------------------------------------------
//
// Curated angles in radians (since simplifier accepts bare numbers as
// radians per §10.4 line 1044). Each trig function is checked against
// Math.* directly. Inverse functions: production returns degrees, oracle
// is in radians — convert before comparing.
const TRIG_RADIAN_INPUTS = [
  0,
  1,
  -1,
  Math.PI / 6,
  Math.PI / 4,
  Math.PI / 3,
  Math.PI / 2,
  -Math.PI / 6,
  -Math.PI / 4,
  -Math.PI / 3,
  -Math.PI / 2,
  Math.PI,
  -Math.PI,
  2 * Math.PI,
  -2 * Math.PI,
];
for (const x of TRIG_RADIAN_INPUTS) {
  test(`oracle: sin(${x}) [radians]`, () => {
    const expected = Math.sin(x);
    const got = numeric(out(`sin(${x})`));
    assert.ok(
      Math.abs(got - expected) < 1e-9,
      `naive=${expected}, prod=${got}`
    );
  });
  test(`oracle: cos(${x}) [radians]`, () => {
    const expected = Math.cos(x);
    const got = numeric(out(`cos(${x})`));
    assert.ok(
      Math.abs(got - expected) < 1e-9,
      `naive=${expected}, prod=${got}`
    );
  });
  test(`oracle: tan(${x}) [radians, may be near-asymptote]`, () => {
    const expected = Math.tan(x);
    const got = numeric(out(`tan(${x})`));
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
    const got = numeric(out(`asin(${x})`));
    assert.ok(
      Math.abs(got - expectedDeg) < 1e-9,
      `naive=${expectedDeg}deg, prod=${got}deg`
    );
  });
  test(`oracle: acos(${x})`, () => {
    const expectedDeg = (Math.acos(x) * 180) / Math.PI;
    const got = numeric(out(`acos(${x})`));
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
    const got = numeric(out(`atan(${x})`));
    assert.ok(
      Math.abs(got - expectedDeg) < 1e-9,
      `naive=${expectedDeg}deg, prod=${got}deg`
    );
  });
}
// atan2: pairs that span the full (-180, 180] range.
const ATAN2_INPUTS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [2, 1],
  [-2, 1],
  [1, 2],
  [3, -4],
];
for (const [y, x] of ATAN2_INPUTS) {
  test(`oracle: atan2(${y}, ${x})`, () => {
    const expectedDeg = (Math.atan2(y, x) * 180) / Math.PI;
    const got = numeric(out(`atan2(${y}, ${x})`));
    assert.ok(
      Math.abs(got - expectedDeg) < 1e-9,
      `naive=${expectedDeg}deg, prod=${got}deg`
    );
  });
}
