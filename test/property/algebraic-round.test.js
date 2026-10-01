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
import { call, num, ident } from '../../src/lib/node.js';
import { numeric } from '../helpers/numeric.js';
import { NUM_RUNS, outAst as out } from '../helpers/laws.js';
import { finiteNum, positiveNum } from '../helpers/arbitraries.js';

const evalRound = (strategy, x, b) =>
  numeric(out(call('round', [ident(strategy), x, b])));

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
          call('round', [ident(strategy), num(numeric(once)), b])
        );
        return once === twice;
      }
    ),
    { numRuns: NUM_RUNS }
  );
});

describe('round() laws', () => {
  test('law: round monotone in strategy — up ≥ nearest ≥ down', () => {
    fc.assert(
      fc.property(finiteNum, positiveNum, (x, b) => {
        const up = evalRound('up', x, b);
        const nearest = evalRound('nearest', x, b);
        const down = evalRound('down', x, b);
        return up >= nearest && nearest >= down;
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: round to-zero ∈ {up, down} and minimizes |result|', () => {
    fc.assert(
      fc.property(finiteNum, positiveNum, (x, b) => {
        const up = evalRound('up', x, b);
        const down = evalRound('down', x, b);
        const tz = evalRound('to-zero', x, b);
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
          const r = evalRound(strategy, x, b);
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
          const r = evalRound(strategy, x, b);
          return Math.abs(r - x.value) <= b.value + 1e-9;
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: nearest minimizes |result − x| (with tie → upper)', () => {
    fc.assert(
      fc.property(finiteNum, positiveNum, (x, b) => {
        const up = evalRound('up', x, b);
        const down = evalRound('down', x, b);
        const nearest = evalRound('nearest', x, b);
        const dUp = Math.abs(up - x.value);
        const dDown = Math.abs(down - x.value);
        return dUp <= dDown ? nearest === up : nearest === down;
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
