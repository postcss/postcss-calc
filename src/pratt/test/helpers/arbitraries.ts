// Shared fast-check arbitraries for property-based and differential tests.
// Kept in a module-private file so the test runner doesn't pick it up.

import fc from 'fast-check';

import type { Node, SumTerm, ProductFactor } from '../../../lib/node.js';
import { mkSum, mkProduct } from '../../../lib/node.js';
import { serialize } from '../../../lib/serialize.js';

const KNOWN_UNITS = [
  'px', 'em', 'rem', 'vw',
  's', 'ms',
  'deg', 'turn',
  '%',
] as const;

const numLeaf: fc.Arbitrary<Node> = fc
  .integer({ min: -100, max: 100 })
  .map((v): Node => ({ type: 'Num', value: v }));

const dimLeaf: fc.Arbitrary<Node> = fc
  .tuple(fc.integer({ min: -100, max: 100 }), fc.constantFrom(...KNOWN_UNITS))
  .map(([v, u]): Node => ({ type: 'Dim', value: v, unit: u }));

const leafArb: fc.Arbitrary<Node> = fc.oneof(numLeaf, dimLeaf);

// Float-valued leaves. Used by property tests that benefit from FP-noise
// stress (idempotence, fixed-point) but not by the differential test —
// floats hit cross-engine ulp drift that the canonicalize step can't
// always absorb.
const FLOAT_RANGE = {
  min: Math.fround(-100),
  max: Math.fround(100),
  noNaN: true,
  noDefaultInfinity: true,
} as const;

const floatNumLeaf: fc.Arbitrary<Node> = fc
  .float(FLOAT_RANGE)
  .map((v): Node => ({ type: 'Num', value: v }));

const floatDimLeaf: fc.Arbitrary<Node> = fc
  .tuple(fc.float(FLOAT_RANGE), fc.constantFrom(...KNOWN_UNITS))
  .map(([v, u]): Node => ({ type: 'Dim', value: v, unit: u }));

const floatLeafArb: fc.Arbitrary<Node> = fc.oneof(floatNumLeaf, floatDimLeaf);

// Degenerate leaves (Infinity, -Infinity, NaN, 0). Mixed at low weight to
// drive §10.13 serialization paths and IEEE-754 propagation under random
// inputs. The differential generator excludes these — csstools and we
// agree at the canonicalize step but the explicit-case coverage already
// lives in unit tests; mixing them in differential adds noise without
// adding signal.
const degenerateNumLeaf: fc.Arbitrary<Node> = fc
  .constantFrom(Infinity, -Infinity, NaN, 0)
  .map((v): Node => ({ type: 'Num', value: v }));

const degenerateDimLeaf: fc.Arbitrary<Node> = fc
  .tuple(
    fc.constantFrom(Infinity, -Infinity, NaN),
    fc.constantFrom(...KNOWN_UNITS)
  )
  .map(([v, u]): Node => ({ type: 'Dim', value: v, unit: u }));

const degenerateLeafArb: fc.Arbitrary<Node> = fc.oneof(
  degenerateNumLeaf,
  degenerateDimLeaf
);

const signArb: fc.Arbitrary<1 | -1> = fc.constantFrom(1, -1);

// Stepped-value / sign-related Call shapes (round, mod, rem, abs, sign)
// for the differential generator. A few constraints, each documented:
//
//   - B > 0: B = 0 is NaN-territory (unit-tested explicitly); B < 0 hits a
//     csstools bug where `round(up/down, …, -B)` flip strategy semantics.
//   - No %: csstools folds `mod(50%, 10%) → 0%`; we keep % opaque per the
//     property-context-undecidable rule (matches our min/max/clamp). This
//     is documented divergence, not a bug.
//   - For two-arg functions, A and B share a unit: cross-family conversion
//     (e.g. `mod(1s, 1ms)`) suffers FP noise like csstools' `1/0.001 ≠ 1000`,
//     producing 0.001s where the math says 0s. Same-unit folding sidesteps
//     it. Cross-unit math is covered by explicit unit tests.

const numUnits = ['', ...KNOWN_UNITS.filter((u) => u !== '%')] as const;
type NumUnit = (typeof numUnits)[number];

function makeLeaf(value: number, unit: NumUnit): Node {
  return unit === ''
    ? { type: 'Num', value }
    : { type: 'Dim', value, unit };
}

/** A single (value, unit) pair → leaf with that unit. */
const valueWithUnit = (positive: boolean): fc.Arbitrary<{ value: number; unit: NumUnit }> =>
  fc.tuple(
    fc.integer(positive ? { min: 1, max: 100 } : { min: -100, max: 100 }),
    fc.constantFrom(...numUnits)
  ).map(([value, unit]) => ({ value, unit }));

/** Two leaves sharing a unit (both Num or both Dim with same unit). */
const sameUnitPair: fc.Arbitrary<[Node, Node]> = fc
  .tuple(
    fc.integer({ min: -100, max: 100 }),
    fc.integer({ min: 1, max: 100 }),
    fc.constantFrom(...numUnits)
  )
  .map(([aVal, bVal, unit]): [Node, Node] => [
    makeLeaf(aVal, unit),
    makeLeaf(bVal, unit),
  ]);

// Trig + exponential family Calls. Each branch hand-tunes its arg
// distribution to land in the foldable region for both engines:
//
//   - pow exponents stay small; large bases × large exponents overflow
//     to Infinity at different precisions across engines.
//   - log / sqrt operands are positive (negatives → NaN).
//   - exp arg stays in [-10, 10] to stay finite at precision 10.
//   - hypot reuses `sameUnitPair` so the type-match rule fires.
//
// asin/acos/atan/atan2 are deliberately omitted: csstools serializes
// inverse-trig output in radians (`0.5235987755983rad` for asin(0.5)),
// while we follow §10.4 line 1086 and emit degrees (`30deg`). Both are
// valid <angle> spellings of the same value, but the canonicalize step
// can't unify deg/rad, so we'd see false divergences. Inverse trig has
// dedicated naive-oracle coverage; not generating it here only loses
// random-input coverage, not correctness coverage.
const trigExpCallArb: fc.Arbitrary<Node> = fc.oneof(
  // sin/cos/tan with bare <number> (radians).
  fc.tuple(
    // tan deliberately omitted: csstools censors asymptotes (e.g. tan(90deg)
  // → infinity); we let Math.tan return ~1.6e16. §10.4.1 line 1057 says
  // implementation-defined — both choices are spec-valid. Naive-oracle
  // covers tan correctness against Math.tan directly.
  fc.constantFrom('sin', 'cos'),
    fc.integer({ min: -10, max: 10 })
  ).map(([name, v]): Node => ({
    type: 'Call', name,
    args: [{ type: 'Num', value: v }],
  })),
  // sin/cos/tan with angle dim — exercises unit-conversion path.
  fc.tuple(
    // tan deliberately omitted: csstools censors asymptotes (e.g. tan(90deg)
  // → infinity); we let Math.tan return ~1.6e16. §10.4.1 line 1057 says
  // implementation-defined — both choices are spec-valid. Naive-oracle
  // covers tan correctness against Math.tan directly.
  fc.constantFrom('sin', 'cos'),
    fc.integer({ min: -360, max: 360 }),
    fc.constantFrom('deg', 'rad', 'grad', 'turn')
  ).map(([name, v, u]): Node => ({
    type: 'Call', name,
    args: [{ type: 'Dim', value: v, unit: u }],
  })),
  // pow: small int A, small int B.
  fc.tuple(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 0, max: 5 }))
    .map(([a, b]): Node => ({
      type: 'Call', name: 'pow',
      args: [{ type: 'Num', value: a }, { type: 'Num', value: b }],
    })),
  // sqrt: non-negative.
  fc.integer({ min: 0, max: 1000 }).map((v): Node => ({
    type: 'Call', name: 'sqrt',
    args: [{ type: 'Num', value: v }],
  })),
  // exp: small range to stay finite at precision 10.
  fc.integer({ min: -10, max: 10 }).map((v): Node => ({
    type: 'Call', name: 'exp',
    args: [{ type: 'Num', value: v }],
  })),
  // log single arg — strictly positive.
  fc.integer({ min: 1, max: 1000 }).map((v): Node => ({
    type: 'Call', name: 'log',
    args: [{ type: 'Num', value: v }],
  })),
  // log(a, b) — positive a, base ≥ 2.
  fc.tuple(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 2, max: 100 }))
    .map(([a, b]): Node => ({
      type: 'Call', name: 'log',
      args: [
        { type: 'Num', value: a },
        { type: 'Num', value: b },
      ],
    })),
  // hypot — same-unit pair (single-arg case is exercised by sameUnitPair shape).
  sameUnitPair.map(([a, b]): Node => ({
    type: 'Call', name: 'hypot', args: [a, b],
  })),
);

const stepwiseCallArb: fc.Arbitrary<Node> = fc.oneof(
  // abs / sign — single arg; no % (we keep % opaque, csstools folds it).
  fc
    .tuple(fc.constantFrom('abs', 'sign'), valueWithUnit(false))
    .map(([name, { value, unit }]): Node => ({
      type: 'Call',
      name,
      args: [makeLeaf(value, unit)],
    })),
  // mod / rem — two args sharing a unit.
  fc
    .tuple(fc.constantFrom('mod', 'rem'), sameUnitPair)
    .map(([name, [a, b]]): Node => ({ type: 'Call', name, args: [a, b] })),
  // round — optional strategy ident; 1 or 2 args sharing a unit.
  fc
    .tuple(
      fc.option(
        fc.constantFrom('nearest', 'up', 'down', 'to-zero'),
        { nil: null }
      ),
      sameUnitPair,
      fc.boolean()
    )
    .map(([strategy, [a, b], includeB]): Node => {
      const args: Node[] = [];
      if (strategy !== null) args.push({ type: 'Ident', name: strategy });
      args.push(a);
      if (includeB) args.push(b);
      else if (a.type !== 'Num') {
        // Single-arg round with dim A is "function invalid" → csstools and
        // we both opaque-passthrough, but with potentially different
        // representations. Force B in to keep agreement.
        args.push(b);
      }
      return { type: 'Call', name: 'round', args };
    })
);

/**
 * Flat top-level math-Call generator. Used by differential tests that
 * exercise trig/exp families without composing them under Sum/Product
 * factors — csstools doesn't fold across math-Call boundaries (e.g.
 * `2 * exp(-2)` is left as `2 * 0.135335283`), and re-canonicalizing
 * those unfolded products through our pipeline drifts by ~1 ulp at the
 * compare precision. Keeping the trig/exp case flat avoids the cascade.
 */
export const trigExpFlatArb: fc.Arbitrary<Node> = trigExpCallArb;

// Shared sub-generators for the three depth-bounded tree arbs. Each one
// builds a Sum or Product from a smaller tree-arb. Extracting these
// removes the structural dup that jscpd surfaces between astArb,
// astArbWithDegenerate, and numericAstArb.
function sumOfSmaller(
  smaller: fc.Arbitrary<Node>
): fc.Arbitrary<Node> {
  return fc
    .array(fc.tuple(signArb, smaller), { minLength: 2, maxLength: 4 })
    .map((pairs) =>
      mkSum(pairs.map(([sign, node]): SumTerm => ({ sign, node })))
    );
}
function productOfSmaller(
  smaller: fc.Arbitrary<Node>
): fc.Arbitrary<Node> {
  return fc
    .array(fc.tuple(signArb, smaller), { minLength: 2, maxLength: 4 })
    .map((pairs) =>
      mkProduct(
        pairs.map(([exponent, node]): ProductFactor => ({ exponent, node }))
      )
    );
}

/**
 * Depth-bounded tree generator. Produces canonical-form ASTs directly
 * through the Sum/Product constructors, so every generated input is
 * guaranteed to be a valid canonical Node.
 */
export const astArb = fc.memo((depth: number): fc.Arbitrary<Node> => {
  if (depth <= 1) {
    return leafArb;
  }
  const smaller = astArb(depth - 1);
  return fc.oneof(
    { weight: 1, arbitrary: leafArb },
    { weight: 2, arbitrary: sumOfSmaller(smaller) },
    { weight: 2, arbitrary: productOfSmaller(smaller) },
    { weight: 1, arbitrary: stepwiseCallArb }
  );
});

/**
 * Variant of `astArb` that mixes degenerate (Infinity / -Infinity / NaN)
 * and float-valued leaves alongside the int leaves. Used by structural
 * property tests (idempotence, fixed-point, double-negation) to stress
 * §10.13 paths and FP-noise tolerance. NOT used by the differential test.
 */
export const astArbWithDegenerate = fc.memo(
  (depth: number): fc.Arbitrary<Node> => {
    const richLeaf = fc.oneof(
      { weight: 6, arbitrary: leafArb },
      { weight: 2, arbitrary: floatLeafArb },
      { weight: 1, arbitrary: degenerateLeafArb }
    );
    if (depth <= 1) {
      return richLeaf;
    }
    const smaller = astArbWithDegenerate(depth - 1);
    return fc.oneof(
      { weight: 1, arbitrary: richLeaf },
      { weight: 2, arbitrary: sumOfSmaller(smaller) },
      { weight: 2, arbitrary: productOfSmaller(smaller) }
    );
  }
);

/**
 * Numeric-only tree (no dimensions) for tests that need type-stable inputs
 * — e.g. `x + 0` only makes sense when `x` is a number.
 */
export const numericAstArb = fc.memo((depth: number): fc.Arbitrary<Node> => {
  if (depth <= 1) {
    return numLeaf;
  }
  const smaller = numericAstArb(depth - 1);
  return fc.oneof(
    { weight: 1, arbitrary: numLeaf },
    { weight: 2, arbitrary: sumOfSmaller(smaller) },
    { weight: 2, arbitrary: productOfSmaller(smaller) }
  );
});

/** Serialize an AST to a calc() string for fast-check inputs. */
export function astToCalc(ast: Node): string {
  const inner = serialize(ast, { precision: false });
  return inner.startsWith('calc(') ? inner : `calc(${inner})`;
}
