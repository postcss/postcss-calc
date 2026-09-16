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
import fc from 'fast-check';
import { tokenize } from '@csstools/css-tokenizer';
import { indexBlocks } from '../../src/lib/block-index.js';
import { parse } from '../../src/lib/parser.js';
import { simplify } from '../../src/lib/simplify.js';
import { serialize } from '../../src/lib/serialize.js';
import { checkCalculationType } from '../../src/lib/calculation-type.js';
import {
  astArb,
  astArbWithDegenerate,
  numericAstArb,
} from '../helpers/arbitraries.js';
import { num, mkProduct, mkSum, negate } from '../../src/lib/node.js';
const NUM_RUNS = 500;
function str(n) {
  return serialize(n, { precision: false });
}
// --- Idempotence ---------------------------------------------------------
// simplify(x) must equal simplify(simplify(x)). Canonical-form + one-pass
// simplify should make this trivially true.
test('property: simplify is idempotent', () => {
  fc.assert(
    fc.property(astArb(4), (ast) => {
      const once = simplify(ast);
      const twice = simplify(once);
      return str(once) === str(twice);
    }),
    { numRuns: NUM_RUNS }
  );
});
// --- Parse-serialize round-trip ------------------------------------------
// serialize(simplify(x)) parsed+simplified back must be indistinguishable
// from the first simplified form at the string level.
test('property: simplify → serialize → parse → simplify is a fixed point', () => {
  fc.assert(
    fc.property(astArb(4), (ast) => {
      const first = simplify(ast);
      const str1 = str(first);
      const tokens = tokenize({ css: str1 });
      const second = simplify(
        parse(tokens, 0, tokens.length, indexBlocks(tokens))
      );
      return str1 === str(second);
    }),
    { numRuns: NUM_RUNS }
  );
});
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
      astArb(3).filter((ast) => checkCalculationType(ast).kind !== 'failure'),
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
// --- Degenerate / float stress -------------------------------------------
// Same invariants as above but with Infinity / NaN / FP-imprecise leaves
// mixed in. Catches regressions in §10.13 paths and IEEE-754 propagation.
test('property: simplify is idempotent under degenerate / float leaves', () => {
  fc.assert(
    fc.property(astArbWithDegenerate(4), (ast) => {
      const once = simplify(ast);
      const twice = simplify(once);
      return str(once) === str(twice);
    }),
    { numRuns: NUM_RUNS }
  );
});
test('property: round-trip stable under degenerate / float leaves', () => {
  fc.assert(
    fc.property(astArbWithDegenerate(4), (ast) => {
      const first = simplify(ast);
      const str1 = str(first);
      const tokens = tokenize({ css: str1 });
      const second = simplify(
        parse(tokens, 0, tokens.length, indexBlocks(tokens))
      );
      return str1 === str(second);
    }),
    { numRuns: NUM_RUNS }
  );
});
