import { test } from 'node:test';
import assert from 'node:assert/strict';

import { out } from '../../helpers/out.ts';

// --- Mutation-targeted tests (kill specific surviving mutants) -----------

test('simplify: sum of only numbers that cancel to zero → bare 0', () => {
  // Exercises `hasNum && numTotal !== 0` branch — when numTotal === 0
  // we must NOT emit a Num term. Output is mkSum([]) → Num(0) default.
  assert.equal(out('calc(1 - 1)'), '0');
});

test('simplify: sum with dim terms only (hasNum stays false)', () => {
  // Drives processTerm into the Num branch zero times — hasNum should
  // remain false, preventing a stray numTotal=0 term in output.
  assert.equal(out('calc(5px + 3px)'), '8px');
});

test('simplify: division by Dim(0, unit) flows through (no throw)', () => {
  // Per §10.9.1 the Product simplifier produces an opaque Call shape —
  // `1 / 0px` is invalid typed-arith (number / length) and stays
  // unreduced rather than throwing.
  assert.equal(out('calc(1 / 0px)'), 'calc(1 / 0px)');
});

test('simplify: coeff=0 with opaque factor is preserved (not collapsed to 0)', () => {
  // Exercises the `opaque.length === 0` guard on the `coeff === 0`
  // collapse — with opaque factors present, 0 * x could be 0*Infinity=NaN
  // per IEEE, so we preserve. Output must contain var(--x).
  const r = out('calc(0 * var(--x))');
  assert.match(r, /var\(--x\)/);
});

test('simplify: coeff=0 with ALL resolvable factors collapses to 0', () => {
  // The positive counterpart: no opaque → safe to collapse.
  assert.equal(out('calc(0 * 5 * 3)'), '0');
});

test('simplify: coeff=0 with a single dim factor preserves the unit', () => {
  // §10.10 keeps unit-bearing zeroes so type info isn't lost. Matches
  // csstools (which is what the differential test compares against). The
  // coefficient absorbs into the dim via the standard single-dim branch.
  assert.equal(out('calc(0px * 0)'), '0px');
  assert.equal(out('calc(2px * 0)'), '0px');
  assert.equal(out('calc(-15px * 0 * 0)'), '0px');
  assert.equal(out('calc(0 * 5em)'), '0em');
});

test('simplify: coeff=0 distributing through a Sum keeps the resolved unit', () => {
  // `(2px + 3px)` simplifies to `5px` first, then `0 * 5px` → `0px` via
  // the single-dim absorption (not the distribution path, since the Sum
  // is gone by then).
  assert.equal(out('calc(0 * (2px + 3px))'), '0px');
});

test('simplify: coeff=0 with multiple dim numerators preserves the Product', () => {
  // `unit^2` isn't expressible, so we keep the structure rather than
  // fabricating one. csstools agrees.
  assert.equal(out('calc(0 * 5px * 3px)'), 'calc(0 * 5px * 3px)');
  assert.equal(out('calc(5em * 0 * 0px)'), 'calc(0 * 5em * 0px)');
});

test('simplify: coeff=0 with a denominator dim preserves the Product', () => {
  // `0 / Xunit` is preserved as a Product; csstools does the same.
  // Collapsing would lose the unit relationship in the divisor.
  assert.equal(out('calc(0 / 1px)'), 'calc(0 / 1px)');
});

test('cancel: different-base numerator/denominator preserves the Product', () => {
  // Exercises `numBase !== denBase` in tryCancelPair — px and s have
  // different base types, can't cancel.
  assert.equal(out('calc(10px / 1s)'), 'calc(10px / 1s)');
});

test('cancel: unknown-unit numerator preserves (no base type)', () => {
  // Exercises `!numBase` short-circuit. 1foo has no registered base.
  const r = out('calc(1foo / 1px)');
  assert.match(r, /1foo/);
  assert.match(r, /1px/);
});

test('fold: first-arg establishes mode — pure-number min', () => {
  // Drives foldConstArgs' initial mode=null → mode='number' branch.
  assert.equal(out('min(5, 10, 3)'), '3');
});

test('fold: second-arg mismatches mode (num after dim)', () => {
  // Exercises `mode !== 'dim'` failure — second arg is a Num when mode
  // was set to 'dim' by the first.
  assert.equal(out('min(1px, 2)'), 'min(1px, 2)');
});

test('fold: different bases at different positions (px then s)', () => {
  // Exercises `base !== b` failure in foldConstArgs.
  assert.equal(out('min(1px, 1s)'), 'min(1px, 1s)');
});

test('simplify: Dim(0) as product numerator does NOT throw', () => {
  // Kills `if (exponent === -1 && n.value === 0)` → `if (true && ...)`:
  // zero-valued numerator is fine, only zero denominators throw.
  assert.equal(out('calc(0px * 2)'), '0px');
  assert.equal(out('calc(3 * 0em)'), '0em');
});

test('simplify: distributive result as a Sum term splices back into outer Sum', () => {
  // Kills the empty-loop-body mutation on the nested-Sum splice branch
  // in processTerm. The inner distribution produces Sum([2px, -4px]);
  // the outer Sum must flatten that into its own terms so the px bucket
  // can combine with the trailing 3px to land at 1px.
  assert.equal(out('calc((2 * (1px - 2px)) + 3px)'), '1px');
});

test('simplify: nested Sum splicing with sign composition', () => {
  // Variant: outer sign=-1 applied to a distributive result flips every
  // inner sign. `-(2 * (1px - 2px)) = -(-2px) = 2px`.
  assert.equal(out('calc(4px - (2 * (1px - 2px)))'), '6px');
});

// --- Opaque leaves -------------------------------------------------------
//
// Opaque leaves: var(), env(), attr(), and unknown functions. Simplification
// flows around them; resolvable neighbors still combine.

test('opaque: var() passes through', () => {
  assert.equal(out('calc(var(--x))'), 'var(--x)');
});

test('opaque: var() with a fallback', () => {
  assert.equal(out('calc(var(--x, 10px))'), 'var(--x, 10px)');
});

test('opaque: var() nested inside a calc() with combinable neighbors', () => {
  assert.equal(
    out('calc(1px + var(--x) + 2px)'),
    'calc(3px + var(--x))'
  );
});

test('opaque: same-unit terms fold, opaque preserved on the right', () => {
  assert.equal(
    out('calc(10px - 3px + var(--x))'),
    'calc(7px + var(--x))'
  );
});

test('opaque: subtraction of opaque preserved', () => {
  assert.equal(
    out('calc(10px - var(--x))'),
    'calc(10px - var(--x))'
  );
});

// §10.12 serialization: resolvable terms come first, opaque after.

test('opaque: env() passes through', () => {
  assert.equal(
    out('calc(env(safe-area-inset-top) + 10px)'),
    'calc(10px + env(safe-area-inset-top))'
  );
});

test('opaque: attr() passes through', () => {
  assert.equal(
    out('calc(attr(data-x) + 1px)'),
    'calc(1px + attr(data-x))'
  );
});

test('opaque: unknown function passes through', () => {
  assert.equal(
    out('calc(some-future-fn(1, 2) + 10px)'),
    'calc(10px + some-future-fn(1, 2))'
  );
});

test('opaque: combinable terms on both sides of opaque', () => {
  assert.equal(
    out('calc(1px + 2px + var(--x) + 3px + 4px)'),
    'calc(10px + var(--x))'
  );
});

test('opaque: sub-calc inside var() fallback simplifies', () => {
  assert.equal(
    out('calc(var(--x, calc(1px + 2px)))'),
    'var(--x, 3px)'
  );
});

test('opaque: min() preserved if any arg is opaque', () => {
  assert.equal(out('min(var(--x), 10px)'), 'min(var(--x), 10px)');
});

test('opaque: unknown unit on a dimension treated as its own unit bucket', () => {
  // Per-unit bucketing preserves source order; `1foo` is its own bucket
  // (unknown base type, no merge possible), `1px` is another.
  assert.equal(out('calc(1foo + 1px)'), 'calc(1foo + 1px)');
});

test('opaque: multiplication with opaque preserved', () => {
  assert.equal(out('calc(2 * var(--x))'), 'calc(2 * var(--x))');
});

test('opaque: cancelled resolvables preserve 0-of-type alongside opaque', () => {
  // §10.10 preserves the combined bucket even when it's zero — the unit
  // carries type info. With no opaque the output would be `0px` (bare).
  assert.equal(out('calc(1px - 1px + var(--x))'), 'calc(0px + var(--x))');
});

test('opaque: zero dim subtracting an opaque', () => {
  assert.equal(out('calc(0px - var(--x))'), 'calc(0px - var(--x))');
});

test('opaque / opaque preserved (no static cancellation)', () => {
  // Two opaque Calls give us no type info to cancel; preserve the Product.
  assert.equal(out('calc(var(--a) / var(--b))'), 'calc(var(--a) / var(--b))');
});

test('opaque: resolvables on both sides of an opaque Product term', () => {
  // The middle term `2px * var(--x)` is opaque (Product with var()), but
  // the leading and trailing px terms must still bucket-merge into 4px.
  assert.equal(
    out('calc(1px + 2px * var(--x) + 3px)'),
    'calc(4px + 2px * var(--x))'
  );
});

test('opaque: bare custom-property ident in a sum (not via var())', () => {
  // `--x` as a bare ident is syntactically allowed by our parser. It's
  // treated as opaque; resolvables come first per §10.12-style ordering.
  assert.equal(out('calc(--x + 1px)'), 'calc(1px + --x)');
});

// --- §10.3 / §10.3.1 / §10.6 spec-text transcription --------------------
//
// One test per spec-stated rule, citing the spec line. These aren't bonus
// — they're the literal spec language as a checklist. If the spec changes,
// these flag the regression first.

test('spec §10.3 line 1004: mod(18px, 5px) === 3px', () => {
  assert.equal(out('mod(18px, 5px)'), '3px');
});

test('spec §10.3 line 1005: mod(-140deg, -90deg) === -50deg', () => {
  assert.equal(out('mod(-140deg, -90deg)'), '-50deg');
});

test('spec §10.3 line 1007: rem === mod when both args same sign', () => {
  assert.equal(out('rem(18px, 5px)'), '3px');
  assert.equal(out('rem(-140deg, -90deg)'), '-50deg');
});

test('spec §10.3 line 1011: mod(-18px, 5px) === 2px', () => {
  assert.equal(out('mod(-18px, 5px)'), '2px');
});

test('spec §10.3 line 1012: rem(-18px, 5px) === -3px', () => {
  assert.equal(out('rem(-18px, 5px)'), '-3px');
});

test('spec §10.3 line 1014: mod(140deg, -90deg) === -40deg', () => {
  assert.equal(out('mod(140deg, -90deg)'), '-40deg');
});

test('spec §10.3 line 1014: rem(140deg, -90deg) === 50deg', () => {
  assert.equal(out('rem(140deg, -90deg)'), '50deg');
});

test('spec §10.3 line 978: nearest tie breaks to upper B', () => {
  // 15 is exactly between 10 and 20; spec says upper wins.
  assert.equal(out('round(15, 10)'), '20');
  // -15 between -20 and -10; upper (+∞-ward) is -10.
  assert.equal(out('round(-15, 10)'), '-10');
});

test('spec §10.3 line 991: B defaults to 1 only when A is <number>', () => {
  assert.equal(out('round(3.7)'), '4');
  // A is dimensional → spec says "omitting B is otherwise invalid".
  assert.equal(out('round(3.7px)'), 'round(3.7px)');
});

test('spec §10.3.1 line 1020: round(A, 0) is NaN', () => {
  assert.equal(out('round(5, 0)'), 'calc(NaN)');
  assert.equal(out('round(up, 5, 0)'), 'calc(NaN)');
  assert.equal(out('round(down, 5, 0)'), 'calc(NaN)');
  assert.equal(out('round(to-zero, 5, 0)'), 'calc(NaN)');
});

test('spec §10.7.1: round(finite, ±infinity) → 0 carrying A\'s sign', () => {
  // floor(A/±∞) = ceil(A/±∞) = ±0; the spec collapses that interval to
  // the nearest multiple of step, which is 0 with sign of A. Strategy
  // doesn't change the result. Found by the differential randomizer.
  assert.equal(out('round(5, infinity)'), '0');
  assert.equal(out('round(up, 5, infinity)'), '0');
  // The simplifier produces -0 for negative A here, but the serializer
  // collapses sign-of-zero to match CSS's numeric `-0 === 0` and the
  // existing test expectations across abs/sign/etc.
  assert.equal(out('round(down, calc(0 - 5), infinity)'), '0');
  assert.equal(out('round(3, calc(0 - infinity))'), '0');
});

test('spec §10.7.1: round(_, NaN) is NaN', () => {
  assert.equal(out('round(5, calc(0 / 0))'), 'calc(NaN)');
  assert.equal(out('round(calc(0 - 5), calc(0 / 0))'), 'calc(NaN)');
});

test('spec §10.7.1: round(±infinity, ±infinity) is NaN', () => {
  assert.equal(out('round(infinity, infinity)'), 'calc(NaN)');
  assert.equal(out('round(calc(0 - infinity), infinity)'), 'calc(NaN)');
});

test('spec §10.3.1 line 1022: round(±infinity, finite) === same infinity', () => {
  assert.equal(out('round(infinity, 10)'), 'calc(infinity)');
  assert.equal(out('round(calc(0 - infinity), 10)'), 'calc(-infinity)');
  assert.equal(out('round(up, infinity, 10)'), 'calc(infinity)');
  assert.equal(out('round(down, calc(0 - infinity), 10)'), 'calc(-infinity)');
  assert.equal(out('round(to-zero, infinity, 10)'), 'calc(infinity)');
});

test('spec §10.3.1 line 1035: mod(±infinity, B) is NaN', () => {
  assert.equal(out('mod(infinity, 5)'), 'calc(NaN)');
  assert.equal(out('mod(calc(0 - infinity), 5)'), 'calc(NaN)');
});

test('spec §10.3.1 line 1035: rem(±infinity, B) is NaN', () => {
  assert.equal(out('rem(infinity, 5)'), 'calc(NaN)');
  assert.equal(out('rem(calc(0 - infinity), 5)'), 'calc(NaN)');
});

test('spec §10.3.1 line 1037: mod(A, infinity) opposite sign is NaN', () => {
  // A negative, B positive infinite → NaN.
  assert.equal(out('mod(-5, infinity)'), 'calc(NaN)');
  // A positive, B negative infinite → NaN.
  assert.equal(out('mod(5, calc(0 - infinity))'), 'calc(NaN)');
});

test('spec §10.3.1 line 1039: mod(A, infinity) same sign returns A', () => {
  assert.equal(out('mod(5, infinity)'), '5');
  // A = 0 is "same sign" (treated as 0⁺ — we don't track 0⁻ explicitly).
  // §10.3.1 line 1037 only NaNs on opposite-signed zero; we always
  // return A. Also exercises the `a !== 0` short-circuit in applyModRem.
  assert.equal(out('mod(0, infinity)'), '0');
  assert.equal(out('mod(0, calc(0 - infinity))'), '0');
});

test('spec §10.3.1 line 1039: rem(A, infinity) returns A regardless of sign', () => {
  assert.equal(out('rem(5, infinity)'), '5');
  assert.equal(out('rem(-5, infinity)'), '-5');
  assert.equal(out('rem(0, infinity)'), '0');
});

test('spec §10.6 line 1144: abs(A) preserves type', () => {
  // Number stays number, dim stays dim with the same unit.
  assert.equal(out('abs(-5)'), '5');
  assert.equal(out('abs(-5px)'), '5px');
  assert.equal(out('abs(-5em)'), '5em');
  assert.equal(out('abs(-5deg)'), '5deg');
});

test('spec §10.6 line 1146: sign(A) always returns <number>', () => {
  // Even when input is a dimension, the result is a bare number.
  assert.equal(out('sign(-5)'), '-1');
  assert.equal(out('sign(-5px)'), '-1');
  assert.equal(out('sign(5em)'), '1');
  assert.equal(out('sign(0deg)'), '0');
});

test('spec §10.6 line 1148: percentage opaque (sign property-context-dependent)', () => {
  // "10% might be positive or negative once it's resolved" — we can't fold.
  assert.equal(out('abs(-50%)'), 'abs(-50%)');
  assert.equal(out('sign(50%)'), 'sign(50%)');
  assert.equal(out('sign(-50%)'), 'sign(-50%)');
});

test('CSS keywords case-insensitive: rounding-strategy idents', () => {
  // CSS idents are case-insensitive by default; our toLowerCase honors that.
  assert.equal(out('round(UP, 11, 10)'), '20');
  assert.equal(out('round(Down, 19, 10)'), '10');
  assert.equal(out('round(TO-ZERO, -19, 10)'), '-10');
  assert.equal(out('round(Nearest, 14, 10)'), '10');
});

test('CSS function names case-insensitive: ROUND, MOD, REM, ABS, SIGN', () => {
  assert.equal(out('ROUND(15, 10)'), '20');
  assert.equal(out('MOD(18, 5)'), '3');
  assert.equal(out('REM(-18, 5)'), '-3');
  assert.equal(out('ABS(-5)'), '5');
  assert.equal(out('SIGN(-5)'), '-1');
});

// --- Boundary-value matrix (corner cases random gen will never hit) ------
//
// These are values that historically break math implementations: signed
// zero, subnormal floats, exact-tie midpoints, FP-imprecise decimals, and
// values near JS number limits. Random fast-check generators bias toward
// small ints and almost never roll these.

test('boundary: round at exact tie midpoints across signs', () => {
  // Spec §10.3 line 978: tie → upper B (closer to +∞).
  assert.equal(out('round(5, 10)'), '10'); // {0, 10}, tie → upper
  assert.equal(out('round(-5, 10)'), '0'); // {-10, 0}, tie → upper (= 0)
  assert.equal(out('round(15, 10)'), '20');
  assert.equal(out('round(-15, 10)'), '-10');
  assert.equal(out('round(25, 10)'), '30');
  assert.equal(out('round(0.5, 1)'), '1');
  assert.equal(out('round(-0.5, 1)'), '0');
});

test('boundary: round just-below-tie and just-above-tie', () => {
  // 4.999...9 should still pick lower (= 0); 5.000...1 should pick upper.
  // Use precision-safe values: differences > Number.EPSILON*5.
  assert.equal(out('round(4.9, 10)'), '0');
  assert.equal(out('round(5.1, 10)'), '10');
  assert.equal(out('round(-4.9, 10)'), '0');
  assert.equal(out('round(-5.1, 10)'), '-10');
});

test('boundary: round on exact multiple preserves value', () => {
  assert.equal(out('round(20, 10)'), '20');
  assert.equal(out('round(0, 10)'), '0');
  assert.equal(out('round(-30, 10)'), '-30');
  assert.equal(out('round(up, 20, 10)'), '20');
  assert.equal(out('round(down, 20, 10)'), '20');
  assert.equal(out('round(to-zero, 20, 10)'), '20');
});

test('boundary: round with very small B', () => {
  // 0.5 / 0.1 = 5, exact multiple. Result should be 0.5.
  assert.equal(out('round(0.5, 0.1)'), '0.5');
  // 0.1 + 0.2 in FP is 0.30000000000000004, but our parser tokenizes
  // literal `0.3` as 0.3 — so this is exact-multiple territory.
  assert.equal(out('round(0.3, 0.1)'), '0.3');
});

test('boundary: round with B much larger than A', () => {
  assert.equal(out('round(0.001, 1000)'), '0');
  assert.equal(out('round(up, 0.001, 1000)'), '1000');
  assert.equal(out('round(down, 0.001, 1000)'), '0');
  assert.equal(out('round(to-zero, 0.001, 1000)'), '0');
  assert.equal(out('round(to-zero, -0.001, 1000)'), '0');
});

test('boundary: round with A near integer limits', () => {
  // 999999 / 100 = 9999.99: lower = 999900, upper = 1000000. Distances: 99
  // vs 1 → upper. Nearest → 1000000.
  assert.equal(out('round(999999, 100)'), '1000000');
  // -999999 / 100 = -9999.99: candidates {-1000000, -999900}. Distances:
  // |-999999 - -1000000| = 1, |-999900 - -999999| = 99 → lower (-1000000) closer.
  assert.equal(out('round(-999999, 100)'), '-1000000');
});

test('boundary: abs on -0 collapses to 0 (mkSum drop-zero)', () => {
  // `Math.abs(-0)` is +0; both serialize as `0`.
  assert.equal(out('abs(-0)'), '0');
  assert.equal(out('abs(calc(-0))'), '0');
});

test('boundary: sign on -0 (JS sign returns -0; both render as 0)', () => {
  // Math.sign(-0) === -0 (JS quirk). Serialize to "0" (Number(-0).toString()).
  assert.equal(out('sign(-0)'), '0');
  assert.equal(out('sign(0)'), '0');
});

test('boundary: abs on infinity / NaN', () => {
  assert.equal(out('abs(infinity)'), 'calc(infinity)');
  assert.equal(out('abs(calc(0 - infinity))'), 'calc(infinity)');
  assert.equal(out('abs(NaN)'), 'calc(NaN)');
});

test('boundary: sign on infinity / NaN', () => {
  assert.equal(out('sign(infinity)'), '1');
  assert.equal(out('sign(calc(0 - infinity))'), '-1');
  assert.equal(out('sign(NaN)'), 'calc(NaN)');
});

test('boundary: mod where A === B → 0', () => {
  // mod(5,5) = 5 - 5*floor(1) = 0; mod(-5,-5) = -5 - (-5)*1 = 0 (positive
  // zero — JS arithmetic: -5 - (-5) = -5 + 5 = +0).
  assert.equal(out('mod(5, 5)'), '0');
  assert.equal(out('mod(-5, -5)'), '0');
  assert.equal(out('mod(5px, 5px)'), '0px');
});

test('boundary: rem where A === B → 0', () => {
  assert.equal(out('rem(5, 5)'), '0');
  assert.equal(out('rem(-5, -5)'), '0');
});

test('boundary: mod where A === -B → 0 (sign cancels)', () => {
  // mod(5, -5): A - B*floor(A/B) = 5 - (-5)*floor(-1) = 5 - (-5)*-1 = 5-5 = 0.
  // mod(-5, 5): -5 - 5*floor(-1) = -5 - 5*-1 = 0.
  assert.equal(out('mod(5, -5)'), '0');
  assert.equal(out('mod(-5, 5)'), '0');
});

test('boundary: round/mod/rem with FP-imprecise decimals', () => {
  // 0.1 + 0.2 ≠ 0.3 in FP. But our parser reads `0.3` directly as 0.3.
  // mod(0.3, 0.1) is exactly 0 in math but FP gives ~0.09999... or 0.
  // We don't assert a specific value — only that it folds without throwing
  // and the result has type number.
  const result = out('mod(0.3, 0.1)');
  assert.match(result, /^-?\d+(\.\d+)?$/, `expected a numeric output, got ${result}`);
});

test('boundary: dimensional 0 in mod/rem keeps unit', () => {
  // §10.10: zero-valued buckets keep type info.
  assert.equal(out('mod(0px, 5px)'), '0px');
  assert.equal(out('rem(0px, 5px)'), '0px');
  assert.equal(out('mod(0deg, 90deg)'), '0deg');
});

// --- Real-world: non-ASCII custom-property names ------------------------

test('round-trip: var(--φ) (Greek phi) preserves the identifier', () => {
  assert.equal(out('calc(var(--φ))'), 'var(--φ)');
});

test('round-trip: var(--φ) inside arithmetic', () => {
  assert.equal(out('calc(1px * var(--φ))'), 'calc(1px * var(--φ))');
});

// --- Real-world: /* */ comments inside calc -----------------------------

test('comments: are skipped inside calc and constants still fold', () => {
  assert.equal(out('calc(10px /* gap */ + 5px)'), '15px');
});

test('comments: leading and trailing comments do not affect output', () => {
  assert.equal(out('calc(/* a */ 10px /* b */ + /* c */ 5px /* d */)'), '15px');
});

// --- Real-world: anchor() / anchor-size() opaque round-trip -----------

test('anchor: bare anchor() round-trips with space-separated args', () => {
  assert.equal(out('anchor(--foo top)'), 'anchor(--foo top)');
});

test('anchor: anchor(implicit bottom) round-trips', () => {
  assert.equal(out('anchor(implicit bottom)'), 'anchor(implicit bottom)');
});

test('anchor: composes inside calc() with surrounding arithmetic', () => {
  // Sum canonicalization sorts the constant first; both forms are
  // semantically identical.
  assert.equal(
    out('calc(anchor(--foo top) - 42px)'),
    'calc(-42px + anchor(--foo top))'
  );
});

test('anchor-size: anchor-size(--foo height) round-trips', () => {
  assert.equal(out('anchor-size(--foo height)'), 'anchor-size(--foo height)');
});
