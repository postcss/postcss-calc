// Cribbed from @csstools/css-calc test corpus:
//   https://github.com/csstools/postcss-plugins/tree/main/packages/css-calc/test
//
// Each test cites its source file. Cases selected where our pipeline
// produces the same output as csstools. Deliberately excluded:
//   - csstools `globals` option (variable substitution) — not in our scope
//   - relative-color math (`rgb(from ...)`) — out of scope
//   - exponential family (pow/sqrt/hypot/log/exp) — not yet implemented (v11.3)
//   - cases where floating-point serialization precision differs (we use
//     `precision: false` to emit full-float, but csstools occasionally
//     rounds at ~15 significant figures in its own way)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { out as pipeline } from '../helpers/out.ts';

/** Full-precision output, matching csstools' default. */
const out = (input: string): string => pipeline(input, { precision: false });

// --- basic/test.mjs -------------------------------------------------------

test('csstools basic: number multiplication', () => {
  assert.equal(out('calc(10 * 2)'), '20');
});

test('csstools basic: left-associative division', () => {
  assert.equal(out('calc(15 / 5 / 3)'), '1');
});

test('csstools basic: parenthesized right-hand division', () => {
  assert.equal(out('calc(15 / (5 / 3))'), '9');
});

test('csstools basic: precedence in mixed + / *', () => {
  assert.equal(out('calc(2 * 3 + 7 * 5)'), '41');
});

test('csstools basic: nested parens honored', () => {
  assert.equal(out('calc(((2 * 3) + 7) * 5)'), '65');
});

test('csstools basic: simple addition of numbers', () => {
  assert.equal(out('calc(2 + 3)'), '5');
});

test('csstools basic: simple subtraction of numbers', () => {
  assert.equal(out('calc(10 - 4)'), '6');
});

// --- wpt/calc-unit-analysis.mjs ------------------------------------------

test('csstools unit-analysis: calc(0) → 0', () => {
  assert.equal(out('calc(0)'), '0');
});

test('csstools unit-analysis: calc(0px) → 0px', () => {
  assert.equal(out('calc(0px)'), '0px');
});

// DIVERGE: csstools preserves source term order; we emit resolvables
// (numbers/same-unit dims) first. Both are valid per §10.12 (which actually
// specifies a third order: numbers → percentages → dims-ASCII-sorted).

test('csstools unit-analysis: length + number preserved as a sum', () => {
  // csstools: `calc(1px + 2)`. Ours reorders.
  assert.equal(out('calc(1px + 2)'), 'calc(2 + 1px)');
});

test('csstools unit-analysis: number + length preserved as a sum', () => {
  assert.equal(out('calc(2 + 1px)'), 'calc(2 + 1px)');
});

test('csstools unit-analysis: length - number preserved as a sum', () => {
  // csstools: `calc(1px - 2)`. Ours: `calc(-2 + 1px)` (reorder pushes the
  // negative number to the front).
  assert.equal(out('calc(1px - 2)'), 'calc(-2 + 1px)');
});

test('csstools unit-analysis: number - length preserved as a sum', () => {
  assert.equal(out('calc(2 - 1px)'), 'calc(2 - 1px)');
});

test('csstools unit-analysis: length * number folds', () => {
  assert.equal(out('calc(2px * 2)'), '4px');
});

test('csstools unit-analysis: number * length folds', () => {
  assert.equal(out('calc(2 * 2px)'), '4px');
});

test('csstools unit-analysis: length * length preserved (unit^2 not expressible)', () => {
  assert.equal(out('calc(2px * 1px)'), 'calc(2px * 1px)');
});

// --- wpt/calc-time-values.mjs (same-unit + cross-unit with exact math) ---

test('csstools time: s + s', () => {
  assert.equal(out('calc(4s + 1s)'), '5s');
});

test('csstools time: ms + ms', () => {
  assert.equal(out('calc(4ms + 1ms)'), '5ms');
});

test('csstools time: s - s', () => {
  assert.equal(out('calc(4s - 1s)'), '3s');
});

test('csstools time: number * s', () => {
  assert.equal(out('calc(4 * 1s)'), '4s');
});

test('csstools time: s * number', () => {
  assert.equal(out('calc(1s * 4)'), '4s');
});

test('csstools time: s / number', () => {
  assert.equal(out('calc(8s / 4)'), '2s');
});

test('csstools time: s / s → unitless', () => {
  assert.equal(out('calc(8s / 2s)'), '4');
});

// --- wpt/calc-angle-values.mjs (same-unit cases — exact math) ------------

test('csstools angle: deg + deg', () => {
  assert.equal(out('calc(45deg + 45deg)'), '90deg');
});

test('csstools angle: rad + rad', () => {
  assert.equal(out('calc(45rad + 45rad)'), '90rad');
});

test('csstools angle: grad + grad', () => {
  assert.equal(out('calc(45grad + 45grad)'), '90grad');
});

test('csstools angle: turn + turn', () => {
  assert.equal(out('calc(0.5turn + 0.5turn)'), '1turn');
});

// --- wpt/minmax-percentage-computed.mjs ----------------------------------
// csstools preserves percent inside min/max/clamp unconditionally.

test('csstools minmax-%: single-arg min kept', () => {
  assert.equal(out('min(1%)'), 'min(1%)');
});

test('csstools minmax-%: single-arg max kept', () => {
  assert.equal(out('max(1%)'), 'max(1%)');
});

test('csstools minmax-%: nested min/max with percent kept', () => {
  assert.equal(out('min(20%, max(10%, 15%))'), 'min(20%, max(10%, 15%))');
});

test('csstools minmax-%: sum around min/max percent kept intact', () => {
  // DIVERGE (order): csstools `calc(min(10%, 20%) + 5%)` → same.
  // Ours emits resolvable `5%` first.
  assert.equal(out('calc(min(10%, 20%) + 5%)'), 'calc(5% + min(10%, 20%))');
});

// --- wpt/minmax-integer-computed.mjs (number-typed min/max) --------------

test('csstools minmax-int: min of integers folds', () => {
  assert.equal(out('min(1, 2, 3)'), '1');
});

test('csstools minmax-int: max of integers folds', () => {
  assert.equal(out('max(1, 2, 3)'), '3');
});

test('csstools minmax-int: single-arg min of number folds', () => {
  assert.equal(out('min(1)'), '1');
});

// --- wpt/minmax-time-computed.mjs (same-unit cases) ----------------------

test('csstools minmax-time: min of seconds', () => {
  assert.equal(out('min(1s, 2s, 3s)'), '1s');
});

test('csstools minmax-time: max of seconds', () => {
  assert.equal(out('max(1s, 2s, 3s)'), '3s');
});

// --- wpt/max-20-arguments.mjs --------------------------------------------

test('csstools max-20: max with many numeric args folds', () => {
  assert.equal(
    out('max(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20)'),
    '20'
  );
});

// --- wpt/calc-in-calc.mjs ------------------------------------------------

test('csstools calc-in-calc: nested calc flattens', () => {
  assert.equal(out('calc(calc(1))'), '1');
});

test('csstools calc-in-calc: double-nested calc flattens', () => {
  assert.equal(out('calc(calc(calc(2px)))'), '2px');
});

test('csstools calc-in-calc: nested calc with sum', () => {
  assert.equal(out('calc(calc(1px + 2px))'), '3px');
});

// --- wpt/clamp-length-computed.mjs (same-unit, fully-resolvable) ---------

test('csstools clamp: middle value selected', () => {
  assert.equal(out('clamp(1px, 2px, 3px)'), '2px');
});

test('csstools clamp: min cap applied', () => {
  assert.equal(out('clamp(5px, 2px, 10px)'), '5px');
});

test('csstools clamp: max cap applied', () => {
  assert.equal(out('clamp(1px, 10px, 5px)'), '5px');
});

// --- basic/none-in-clamp.mjs (subset) ------------------------------------
// clamp(none, ...) uses keyword `none` as unbounded. csstools supports this;
// we treat `none` as an opaque ident, so these preserve.

test('csstools none-in-clamp: none as lower bound preserved', () => {
  assert.equal(out('clamp(none, 10px, 20px)'), 'clamp(none, 10px, 20px)');
});

test('csstools none-in-clamp: none as upper bound preserved', () => {
  assert.equal(out('clamp(1px, 10px, none)'), 'clamp(1px, 10px, none)');
});

// --- wpt/invalid.mjs (subset our tokenizer/parser rejects) ---------------

test('csstools invalid: empty calc throws', () => {
  assert.throws(() => out('calc()'), /takes exactly one argument/);
});

test('csstools invalid: trailing operator throws', () => {
  // §10.1: `+`/`-` must be surrounded by whitespace. The trailing `+`
  // is followed by `)` without a space, which now throws at the
  // strict-whitespace check.
  assert.throws(
    () => out('calc(1 +)'),
    /must be surrounded by whitespace|Unexpected token/
  );
});

test('csstools invalid: lonely binary op throws', () => {
  assert.throws(() => out('calc(/)'), /Unexpected token/);
});

// --- @csstools/css-calc round/mod/rem/abs/sign fixtures ------------------
// Cribbed from packages/css-calc/test for the stepped/sign-related suite.

test('csstools round: default strategy (nearest)', () => {
  assert.equal(out('round(15, 10)'), '20');
  assert.equal(out('round(14, 10)'), '10');
});

test('csstools round: dim A and B in same family', () => {
  assert.equal(out('round(15px, 10px)'), '20px');
});

test('csstools round: each strategy', () => {
  assert.equal(out('round(up, 1.1, 1)'), '2');
  assert.equal(out('round(down, 1.9, 1)'), '1');
  assert.equal(out('round(to-zero, -1.9, 1)'), '-1');
  assert.equal(out('round(nearest, 1.5, 1)'), '2');
});

test('csstools round: B omitted for <number> A', () => {
  assert.equal(out('round(3.7)'), '4');
});

test('csstools round: opaque var() preserved', () => {
  assert.equal(out('round(var(--x), 10)'), 'round(var(--x), 10)');
});

test('csstools mod: spec examples', () => {
  assert.equal(out('mod(18, 5)'), '3');
  assert.equal(out('mod(-18, 5)'), '2');
  assert.equal(out('mod(18, -5)'), '-2');
});

test('csstools rem: spec examples', () => {
  assert.equal(out('rem(18, 5)'), '3');
  assert.equal(out('rem(-18, 5)'), '-3');
  assert.equal(out('rem(18, -5)'), '3');
});

test('csstools mod/rem: dim args fold', () => {
  assert.equal(out('mod(18px, 5px)'), '3px');
  assert.equal(out('rem(18px, 5px)'), '3px');
});

test('csstools abs: number and dim', () => {
  assert.equal(out('abs(-5)'), '5');
  assert.equal(out('abs(-5px)'), '5px');
  assert.equal(out('abs(5em)'), '5em');
});

test('csstools abs: opaque preserves', () => {
  assert.equal(out('abs(var(--x))'), 'abs(var(--x))');
});

test('csstools sign: number, dim, opaque', () => {
  assert.equal(out('sign(-5)'), '-1');
  assert.equal(out('sign(5)'), '1');
  assert.equal(out('sign(0)'), '0');
  assert.equal(out('sign(-5px)'), '-1');
  assert.equal(out('sign(var(--x))'), 'sign(var(--x))');
});

test('csstools round: type mismatch → opaque', () => {
  assert.equal(out('round(1px, 1deg)'), 'round(1px, 1deg)');
});

test('csstools mod/rem: type mismatch → opaque', () => {
  assert.equal(out('mod(1px, 1deg)'), 'mod(1px, 1deg)');
  assert.equal(out('rem(1px, 1deg)'), 'rem(1px, 1deg)');
});

test('csstools round: cross-family conversion (in/px)', () => {
  // 1in = 96px exactly; round(96px, 24px) = 96px = 1in (first unit wins).
  assert.equal(out('round(1in, 24px)'), '1in');
});

test('csstools mod: cross-family time (1s, 100ms)', () => {
  // 1s = 1000ms; mod(1000ms, 100ms) = 0ms; result in first unit (s) → 0s.
  assert.equal(out('mod(1s, 100ms)'), '0s');
});

// --- trig/test.mjs (§10.4) -----------------------------------------------
//
// `out` here uses precision: false, so floating-point artifacts that the
// default-precision unit suite swallows show through here as the literal
// JS strings (e.g. cos(60deg) = 0.5000000000000001).

test('csstools trig: sin(0) → 0', () => {
  assert.equal(out('sin(0)'), '0');
});

test('csstools trig: cos(0) → 1', () => {
  assert.equal(out('cos(0)'), '1');
});

test('csstools trig: tan(0) → 0', () => {
  assert.equal(out('tan(0)'), '0');
});

test('csstools trig: sin(90deg) → 1', () => {
  assert.equal(out('sin(90deg)'), '1');
});

test('csstools trig: cos(180deg) → -1', () => {
  assert.equal(out('cos(180deg)'), '-1');
});

test('csstools trig: cos(60deg) → 0.5000000000000001 (full precision)', () => {
  assert.equal(out('cos(60deg)'), '0.5000000000000001');
});

test('csstools trig: tan(45deg) → 0.9999999999999999 (full precision)', () => {
  assert.equal(out('tan(45deg)'), '0.9999999999999999');
});

test('csstools trig: sin(pi) → 1.2246467991473532e-16 (full precision)', () => {
  assert.equal(out('sin(pi)'), '1.2246467991473532e-16');
});

test('csstools trig: sin(0.5turn) → 1.2246467991473532e-16', () => {
  assert.equal(out('sin(0.5turn)'), '1.2246467991473532e-16');
});

test('csstools trig: bare-number arg is radians — sin(pi / 2) → 1', () => {
  assert.equal(out('sin(pi / 2)'), '1');
});

test('csstools trig: var() arg → opaque', () => {
  assert.equal(out('sin(var(--x))'), 'sin(var(--x))');
});

test('csstools trig: length arg → opaque (must be number or angle)', () => {
  assert.equal(out('sin(10px)'), 'sin(10px)');
});

test('csstools inverse-trig: asin(0) → 0deg', () => {
  assert.equal(out('asin(0)'), '0deg');
});

test('csstools inverse-trig: asin(1) → 90deg', () => {
  assert.equal(out('asin(1)'), '90deg');
});

test('csstools inverse-trig: asin(-1) → -90deg', () => {
  assert.equal(out('asin(-1)'), '-90deg');
});

test('csstools inverse-trig: asin(0.5) → 30.000000000000004deg', () => {
  assert.equal(out('asin(0.5)'), '30.000000000000004deg');
});

test('csstools inverse-trig: acos(1) → 0deg (zero-valued angle keeps unit)', () => {
  assert.equal(out('acos(1)'), '0deg');
});

test('csstools inverse-trig: acos(-1) → 180deg', () => {
  assert.equal(out('acos(-1)'), '180deg');
});

test('csstools inverse-trig: atan(1) → 45deg (exact in JS)', () => {
  assert.equal(out('atan(1)'), '45deg');
});

test('csstools inverse-trig: atan(infinity) → 90deg', () => {
  assert.equal(out('atan(infinity)'), '90deg');
});

test('csstools inverse-trig: dim arg → opaque (asin/acos/atan need <number>)', () => {
  assert.equal(out('asin(45deg)'), 'asin(45deg)');
});

test('csstools atan2: (0, 1) → 0deg', () => {
  assert.equal(out('atan2(0, 1)'), '0deg');
});

test('csstools atan2: (1, 0) → 90deg', () => {
  assert.equal(out('atan2(1, 0)'), '90deg');
});

test('csstools atan2: (1, 1) → 45deg', () => {
  assert.equal(out('atan2(1, 1)'), '45deg');
});

test('csstools atan2: (-1, -1) → -135deg', () => {
  assert.equal(out('atan2(-1, -1)'), '-135deg');
});

test('csstools atan2: cross-unit-same-base (1in, 96px) → 45deg', () => {
  assert.equal(out('atan2(1in, 96px)'), '45deg');
});

test('csstools atan2: type mismatch → opaque', () => {
  assert.equal(out('atan2(1px, 1deg)'), 'atan2(1px, 1deg)');
});

test('csstools atan2: percentages → opaque', () => {
  assert.equal(out('atan2(50%, 50%)'), 'atan2(50%, 50%)');
});

// --- §10.5 exponential family fixtures -------------------------------

test('csstools pow: pow(2, 3) → 8', () => {
  assert.equal(out('pow(2, 3)'), '8');
});

test('csstools pow: pow(8, 1 / 3) ≈ 2', () => {
  // csstools agrees on the cube-root identity within FP precision.
  const got = parseFloat(out('pow(8, 1 / 3)'));
  assert.ok(Math.abs(got - 2) < 1e-9, `got ${got}`);
});

test('csstools sqrt: sqrt(16) → 4', () => {
  assert.equal(out('sqrt(16)'), '4');
});

test('csstools sqrt: sqrt(0) → 0', () => {
  assert.equal(out('sqrt(0)'), '0');
});

test('csstools exp: exp(0) → 1', () => {
  assert.equal(out('exp(0)'), '1');
});

test('csstools log: log(8, 2) → 3', () => {
  assert.equal(out('log(8, 2)'), '3');
});

test('csstools log: natural log of e → 1', () => {
  assert.equal(out('log(e)'), '1');
});

test('csstools hypot: hypot(3, 4) → 5', () => {
  assert.equal(out('hypot(3, 4)'), '5');
});

test('csstools hypot: hypot(3px, 4px) → 5px', () => {
  assert.equal(out('hypot(3px, 4px)'), '5px');
});

test('csstools hypot: single arg passes through as abs', () => {
  assert.equal(out('hypot(-2em)'), '2em');
});

// --- §10.13 degenerate-number fixtures -------------------------------

test('csstools degenerate: calc(infinity) round-trips', () => {
  assert.equal(out('calc(infinity)'), 'calc(infinity)');
});

test('csstools degenerate: division by zero produces calc(infinity * 1px)', () => {
  assert.equal(out('calc(1px / 0)'), 'calc(infinity * 1px)');
});

test('csstools degenerate: NaN canonical casing on output', () => {
  assert.equal(out('calc(NaN)'), 'calc(NaN)');
});

test('csstools degenerate: subtracting infinities → NaN', () => {
  assert.equal(out('calc(infinity - infinity)'), 'calc(NaN)');
});
