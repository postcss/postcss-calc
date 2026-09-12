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
// --- §10.5 oracle rows for pow / sqrt / exp / log / hypot --------------
const POW_INPUTS = [
  [2, 3],
  [2, 0.5],
  [4, 0.5],
  [3, 4],
  [10, 2],
  [-2, 3],
  [-2, 4],
  [0, 0],
  [0, 5],
  [5, 0],
  [10, -2],
  [Math.E, 2],
  [Math.PI, 2],
];
for (const [a, b] of POW_INPUTS) {
  test(`oracle: pow(${a}, ${b})`, () => {
    const expected = Math.pow(a, b);
    const got = numeric(out(`pow(${a}, ${b})`));
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
    const got = numeric(out(`sqrt(${x})`));
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
    const got = numeric(out(`exp(${x})`));
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
    const got = numeric(out(`log(${x})`));
    assert.ok(
      Math.abs(got - expected) < 1e-9,
      `naive=${expected}, prod=${got}`
    );
  });
}
const LOG2_INPUTS = [
  [8, 2],
  [100, 10],
  [27, 3],
  [16, 4],
  [1024, 2],
];
for (const [a, b] of LOG2_INPUTS) {
  test(`oracle: log(${a}, ${b})`, () => {
    const expected = Math.log(a) / Math.log(b);
    const got = numeric(out(`log(${a}, ${b})`));
    assert.ok(
      Math.abs(got - expected) < 1e-9,
      `naive=${expected}, prod=${got}`
    );
  });
}
const HYPOT_INPUTS = [
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
    const got = numeric(out(`hypot(${args.join(', ')})`));
    assert.ok(
      Math.abs(got - expected) < 1e-9,
      `naive=${expected}, prod=${got}`
    );
  });
}
