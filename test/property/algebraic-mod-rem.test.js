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
import { call, num, ident } from '../../src/lib/node.js';

const NUM_RUNS = 500;

const out = (n) => serialize(simplify(n), { precision: 10 });
const scalarText = (text) =>
  text.startsWith('calc(') && text.endsWith(')')
    ? text.slice('calc('.length, -1)
    : text;
const numeric = (text) => Number.parseFloat(scalarText(text));

// Finite, non-zero numeric leaf — domain for most laws.
const finiteNum = fc.integer({ min: -1000, max: 1000 }).map(num);

const positiveNum = fc.integer({ min: 1, max: 1000 }).map(num);

// --- mod / rem laws ------------------------------------------------------
test('law: mod range — 0 ≤ mod(x, B) < B (for B > 0, finite x)', () => {
  fc.assert(
    fc.property(finiteNum, positiveNum, (x, b) => {
      const r = numeric(out(call('mod', [x, b])));
      return r >= 0 && r < b.value;
    }),
    { numRuns: NUM_RUNS }
  );
});

describe('law: Rem Range', () => {
  test('law: rem range — |rem(x, B)| < B (for B > 0, finite x)', () => {
    fc.assert(
      fc.property(finiteNum, positiveNum, (x, b) => {
        const r = numeric(out(call('rem', [x, b])));
        return Math.abs(r) < b.value;
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: rem sign follows dividend — sign(rem(x, B)) ∈ {sign(x), 0}', () => {
    fc.assert(
      fc.property(finiteNum, positiveNum, (x, b) => {
        const r = numeric(out(call('rem', [x, b])));
        if (r === 0) return true;
        return Math.sign(r) === Math.sign(x.value);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: mod periodicity — mod(x + B, B) ≡ mod(x, B)', () => {
    fc.assert(
      fc.property(finiteNum, positiveNum, (x, b) => {
        const lhs = numeric(out(call('mod', [num(x.value + b.value), b])));
        const rhs = numeric(out(call('mod', [x, b])));
        return Math.abs(lhs - rhs) < 1e-9;
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: spec line 1017 — rem(A, B) ≡ A − round(to-zero, A, B)', () => {
    fc.assert(
      fc.property(finiteNum, positiveNum, (a, b) => {
        const lhs = numeric(out(call('rem', [a, b])));
        const r = numeric(out(call('round', [ident('to-zero'), a, b])));
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
        const lhs = numeric(out(call('mod', [a, b])));
        const r = numeric(out(call('round', [ident('down'), a, b])));
        const rhs = a.value - r;
        return Math.abs(lhs - rhs) < 1e-9;
      }),
      { numRuns: NUM_RUNS }
    );
  });
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
        const lhs = numeric(
          out(call('round', [ident(strategy), num(k * xRaw), num(k * bRaw)]))
        );
        const inner = numeric(
          out(call('round', [ident(strategy), num(xRaw), num(bRaw)]))
        );
        const rhs = k * inner;
        return Math.abs(lhs - rhs) < 1e-6;
      }
    ),
    { numRuns: NUM_RUNS }
  );
});
