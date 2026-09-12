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
import { call, num, dim } from '../../src/lib/node.js';

const NUM_RUNS = 500;

const out = (n) => serialize(simplify(n), { precision: 10 });
const scalarText = (text) =>
  text.startsWith('calc(') && text.endsWith(')')
    ? text.slice('calc('.length, -1)
    : text;
const numeric = (text) => Number.parseFloat(scalarText(text));

// Finite, non-zero numeric leaf — domain for most laws.
const finiteNum = fc.integer({ min: -1000, max: 1000 }).map(num);

const finiteNonzeroNum = fc
  .integer({ min: -1000, max: 1000 })
  .filter((v) => v !== 0)
  .map(num);

// Same-unit dim pair (so foldConstArgs works without conversion noise).
const SAME_UNIT_DIMS = ['px', 'em', 'deg', 's', 'rem'];

const finiteDim = fc
  .tuple(
    fc.integer({ min: -1000, max: 1000 }),
    fc.constantFrom(...SAME_UNIT_DIMS)
  )
  .map(([v, u]) => dim(v, u));

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

describe('law: Abs Is', () => {
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
        return !scalarText(absStr).startsWith('-');
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
        const outer = out(call('sign', [num(numeric(inner))]));
        return inner === outer;
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: sign is odd — sign(-x) ≡ -sign(x) (when x ≠ 0)', () => {
    fc.assert(
      fc.property(finiteNonzeroNum, (x) => {
        const negX = num(-x.value);
        const lhs = numeric(out(call('sign', [negX])));
        const rhs = -numeric(out(call('sign', [x])));
        return Object.is(lhs, rhs) || lhs === rhs;
      }),
      { numRuns: NUM_RUNS }
    );
  });

  test('law: abs(x) * sign(x) ≡ x — for finite numeric x', () => {
    fc.assert(
      fc.property(finiteNonzeroNum, (x) => {
        const a = numeric(out(call('abs', [x])));
        const s = numeric(out(call('sign', [x])));
        return a * s === x.value;
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
