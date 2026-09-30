// Property-based tests via fast-check. Each invariant is a claim that must
// hold for every valid calc() expression — catches the classes of bugs we'd
// never write explicit tests for (non-convergent simplification, asymmetric
// folding, round-trip breakage).
//
// With v2's canonical AST, several of these invariants are now *structural*
// — the constructors enforce them at construction time, so the property
// test exists to assert the design hasn't drifted rather than to drive bug
// hunting. We still keep them in CI as a guardrail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { simplify } from '../../src/lib/simplify.js';
import { analyze } from '../../src/lib/analyze.js';
import { serialize } from '../../src/lib/serialize.js';
import {
  astArb,
  astArbWithDegenerate,
  numericAstArb,
} from '../helpers/arbitraries.js';
import { parseSource } from '../helpers/parse-source.js';
import { num, mkProduct, mkSum, negate } from '../../src/lib/node.js';
const NUM_RUNS = 500;
function str(n) {
  return serialize(n, { precision: false });
}
// --- Idempotence and round-trip ------------------------------------------
// simplify(x) must equal simplify(simplify(x)), and serialize(simplify(x))
// parsed+simplified back must be indistinguishable at the string level.
// Checked for the regular generator and for one with Infinity / NaN /
// FP-imprecise leaves mixed in (§10.13 paths and IEEE-754 propagation).
for (const [label, arb] of [
  ['', astArb(4)],
  [' under degenerate / float leaves', astArbWithDegenerate(4)],
]) {
  test(`property: simplify is idempotent${label}`, () => {
    fc.assert(
      fc.property(arb, (ast) => {
        const once = simplify(ast);
        return str(once) === str(simplify(once));
      }),
      { numRuns: NUM_RUNS }
    );
  });
  test(`property: simplify → serialize → parse → simplify is a fixed point${label}`, () => {
    fc.assert(
      fc.property(arb, (ast) => {
        const str1 = str(simplify(ast));
        return str1 === str(simplify(parseSource(str1)));
      }),
      { numRuns: NUM_RUNS }
    );
  });
}
// --- Analysis/simplification contract -----------------------------------
// Analysis summarizes the original tree, while simplification may refine
// coarse unknown types. It must not invalidate a valid tree, change a known
// type, or introduce unresolved state.
for (const [label, arb] of [
  ['', astArb(4)],
  [' on degenerate trees', astArbWithDegenerate(3)],
]) {
  test(`property: simplification preserves analysis invariants${label}`, () => {
    fc.assert(
      fc.property(arb, (ast) => {
        const before = analyze(ast);
        if (!before.valid) return true;
        const after = analyze(simplify(ast));
        assert.deepEqual(after.valid, true);
        if (before.type !== 'unknown') {
          assert.deepEqual(after.type, before.type);
        }
        if (!before.unresolved) {
          assert.deepEqual(after.unresolved, false);
        }
        return true;
      }),
      { numRuns: NUM_RUNS }
    );
  });
}

test('property: percentage division is typed as a number before simplification', () => {
  const ast = parseSource('10% / 5%');
  const before = analyze(ast);
  const after = analyze(simplify(ast));
  assert.deepEqual(before, {
    type: 'number',
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(after, {
    type: 'number',
    valid: true,
    unresolved: false,
  });
});
// --- Parse-serialize round-trip ------------------------------------------
// serialize(simplify(x)) parsed+simplified back must be indistinguishable
// from the first simplified form at the string level.
// --- Multiplicative identity ---------------------------------------------
test('property: x * 1 ≡ simplify(x)', () => {
  fc.assert(
    fc.property(astArb(3), (ast) => {
      const withOne = mkProduct([
        { exponent: 1, node: ast },
        { exponent: 1, node: num(1) },
      ]);
      const lhs = simplify(withOne);
      const rhs = simplify(ast);
      return str(lhs) === str(rhs);
    }),
    { numRuns: NUM_RUNS }
  );
});
// --- Additive identity (numeric only) ------------------------------------
test('property: numeric x + 0 ≡ simplify(x)', () => {
  fc.assert(
    fc.property(numericAstArb(3), (ast) => {
      const withZero = mkSum([
        { sign: 1, node: ast },
        { sign: 1, node: num(0) },
      ]);
      const lhs = simplify(withZero);
      const rhs = simplify(ast);
      return str(lhs) === str(rhs);
    }),
    { numRuns: NUM_RUNS }
  );
});
// --- Double negation -----------------------------------------------------
test('property: -(-x) ≡ simplify(x)', () => {
  fc.assert(
    // Double negation is a CSS identity only for a type-valid calculation.
    // The structural generator intentionally combines arbitrary dimensions,
    // which can otherwise produce invalid sums such as `-0 + 0px`.
    fc.property(
      astArb(3).filter((ast) => analyze(ast).valid),
      (ast) => {
        const doubleNeg = negate(negate(ast));
        const lhs = simplify(doubleNeg);
        const rhs = simplify(ast);
        return str(lhs) === str(rhs);
      }
    ),
    { numRuns: NUM_RUNS }
  );
});
