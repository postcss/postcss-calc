// WPT (web-platform-tests) subset cribbed from:
//   https://github.com/web-platform-tests/wpt/tree/master/css/css-values
//
// Each test cites its source file. Cases selected where our output
// matches the spec-defined simplified form without requiring:
//   - Chrome/Firefox's canonical reordering of sum terms (§10.12 step 4),
//   - eager normalization of absolute length units to px (a browser
//     serialization choice, not a spec requirement for calc()),
//   - infinity / NaN serialization (covered when full IEEE-754 fold lands).
//
// Trig (§10.4: sin/cos/tan/asin/acos/atan/atan2) is covered below; the
// exponential family (pow/sqrt/hypot/log/exp) lands in v11.3.
//
// Divergences are documented with `DIVERGE:` comments.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { out } from '../helpers/out.ts';

// --- calc-serialization.html ---------------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/calc-serialization.html

test('WPT calc-serialization: single negative length preserved', () => {
  // Input: `calc(-10px)` → WPT expects `calc(-10px)`.
  // DIVERGE: we unwrap single values to bare dimensions.
  assert.equal(out('calc(-10px)'), '-10px');
});

test('WPT calc-serialization: resolvable + opaque kept as a sum', () => {
  // Input: `calc(10px + 1vmin)` → WPT: `calc(10px + 1vmin)` (same order).
  assert.equal(out('calc(10px + 1vmin)'), 'calc(10px + 1vmin)');
});

// --- minmax-length-serialize.html ----------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/minmax-length-serialize.html

test('WPT minmax-length: single-arg min folds', () => {
  // WPT specified: `calc(1px)`; our output unwraps to `1px`.
  assert.equal(out('min(1px)'), '1px');
});

test('WPT minmax-length: single-arg max folds', () => {
  assert.equal(out('max(1px)'), '1px');
});

test('WPT minmax-length: unit case normalized to lowercase', () => {
  // Spec §10.12: `1Q` serializes as `1q`, `1PX` as `1px`.
  assert.equal(out('min(1PX)'), '1px');
});

test('WPT minmax-length: min() preserved when arg types mix', () => {
  // WPT: `min(1px, 1em)` stays `min(1px, 1em)` (em is relative).
  assert.equal(out('min(1px, 1em)'), 'min(1px, 1em)');
});

test('WPT minmax-length: max folds when all args share a unit', () => {
  // WPT (same unit): `max(1px, 2px, 3px)` → `3px`.
  assert.equal(out('max(1px, 2px, 3px)'), '3px');
});

// --- calc-in-calc.html ---------------------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/calc-in-calc.html

test('WPT calc-in-calc: outer calc() flattens inner calc()', () => {
  assert.equal(out('calc(calc(100%))'), '100%');
});

test('WPT calc-in-calc: nested calc() with sum', () => {
  assert.equal(out('calc(calc(1px + 2px) + 3px)'), '6px');
});

test('WPT calc-in-calc: doubly-nested calc', () => {
  assert.equal(out('calc(calc(calc(5px)))'), '5px');
});

// --- calc-catch-divide-by-0.html (now §10.9.1 IEEE-754 form) ------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/calc-catch-divide-by-0.html

test('WPT divide-by-zero: 100px / 0 → calc(infinity * 1px)', () => {
  assert.equal(out('calc(100px / 0)'), 'calc(infinity * 1px)');
});

test('WPT divide-by-zero: 100px / (2 - 2) → calc(infinity * 1px)', () => {
  assert.equal(out('calc(100px / (2 - 2))'), 'calc(infinity * 1px)');
});

// --- calc-typed-arithmetic-parsing (implied from spec §10.2) -------------

test('WPT typed-arith: <length> / <length> → <number>', () => {
  assert.equal(out('calc(10px / 2px)'), '5');
});

test('WPT typed-arith: <time> / <time> → <number>', () => {
  assert.equal(out('calc(1s / 500ms)'), '2');
});

test('WPT typed-arith: <length> * <number>', () => {
  assert.equal(out('calc(10px * 2)'), '20px');
});

test('WPT typed-arith: <number> * <length>', () => {
  assert.equal(out('calc(2 * 10px)'), '20px');
});

// --- calc-keyword folding (§10.9) ----------------------------------------

test('WPT calc-keyword: pi resolves in a calc', () => {
  // WPT cases expect `calc(3.14159265358979)` with ~15 digits; our default
  // precision of 5 produces `3.14159`. Same number, different formatting.
  assert.equal(out('calc(pi)'), '3.14159');
});

test('WPT calc-keyword: e resolves in a calc', () => {
  assert.equal(out('calc(e)'), '2.71828');
});

test('WPT calc-keyword: pi multiplied by a unit', () => {
  assert.equal(out('calc(pi * 1rad)'), '3.14159rad');
});

// --- var()-preservation round-trips (widely tested across WPT) -----------

test('WPT var: var() passes through in calc', () => {
  assert.equal(out('calc(var(--x))'), 'var(--x)');
});

test('WPT var: resolvables around a var()', () => {
  // Sum of 1px + 2px combines, var() preserved. Matches WPT behavior for
  // the parts that don't depend on browser resolution of --x.
  assert.equal(out('calc(1px + var(--x) + 2px)'), 'calc(3px + var(--x))');
});

test('WPT var: var with resolvable calc in the fallback', () => {
  assert.equal(out('var(--x, calc(1px + 2px))'), 'var(--x, 3px)');
});

// --- clamp (implied from spec §10.8) -------------------------------------

test('WPT clamp: all args resolve — returns middle value', () => {
  assert.equal(out('clamp(0px, 5px, 10px)'), '5px');
});

test('WPT clamp: val below min — clamped to min', () => {
  assert.equal(out('clamp(10px, 5px, 20px)'), '10px');
});

test('WPT clamp: val above max — clamped to max', () => {
  assert.equal(out('clamp(0px, 50px, 10px)'), '10px');
});

test('WPT clamp: preserved when an arg is opaque', () => {
  assert.equal(
    out('clamp(0px, var(--x), 10px)'),
    'clamp(0px, var(--x), 10px)'
  );
});

// --- 1px-2 single-token tokenization -------------------------------------
// The tokenizer treats `1px-2` as a dimension with unit `px-2` (spec §10.1,
// CSS tokenization — idents may contain `-` and digits in the body).

test('WPT tokenization: 1px-2 is a single unknown-unit dimension', () => {
  // Unknown unit → treated as opaque by simplify; passes through verbatim.
  assert.equal(out('calc(1px-2)'), '1px-2');
});

// --- minmax-number-serialize.html ----------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/minmax-number-serialize.html

test('WPT minmax-number: single .1', () => {
  assert.equal(out('min(.1)'), '0.1');
  assert.equal(out('max(.1)'), '0.1');
});

test('WPT minmax-number: min picks smallest number', () => {
  assert.equal(out('min(.1, .2, .3)'), '0.1');
  assert.equal(out('min(.3, .2, .1)'), '0.1');
});

test('WPT minmax-number: max picks largest number', () => {
  assert.equal(out('max(.1, .2, .3)'), '0.3');
  assert.equal(out('max(.3, .2, .1)'), '0.3');
});

test('WPT minmax-number: min folded inside a sum', () => {
  assert.equal(out('calc(min(.1) + min(.2))'), '0.3');
});

test('WPT minmax-number: max inside a sum', () => {
  assert.equal(out('calc(max(.1) + max(.2))'), '0.3');
});

test('WPT minmax-number: sum of number and folded min', () => {
  assert.equal(out('calc(.1 + min(.1))'), '0.2');
});

// --- minmax-time-serialize.html ------------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/minmax-time-serialize.html
// Same-unit cases only — Chrome normalizes ms→s, we preserve source unit.

test('WPT minmax-time: single-arg second', () => {
  assert.equal(out('min(1s)'), '1s');
  assert.equal(out('max(1s)'), '1s');
});

test('WPT minmax-time: min of three same-unit seconds', () => {
  assert.equal(out('min(1s, 2s, 3s)'), '1s');
  assert.equal(out('min(3s, 2s, 1s)'), '1s');
});

test('WPT minmax-time: max of three same-unit seconds', () => {
  assert.equal(out('max(1s, 2s, 3s)'), '3s');
});

// --- minmax-angle-serialize.html -----------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/minmax-angle-serialize.html
// Same-unit cases only — cross-unit angle conversion produces values in the
// first arg's unit (turn/rad precision makes full cross-unit tests brittle).

test('WPT minmax-angle: single-arg degree', () => {
  assert.equal(out('min(90deg)'), '90deg');
  assert.equal(out('max(90deg)'), '90deg');
});

test('WPT minmax-angle: min of degrees', () => {
  assert.equal(out('min(90deg, 92deg, 93deg)'), '90deg');
  assert.equal(out('min(93deg, 92deg, 90deg)'), '90deg');
});

test('WPT minmax-angle: max of degrees', () => {
  assert.equal(out('max(81deg, 82deg, 90deg)'), '90deg');
});

// --- minmax-percentage-serialize.html ------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/minmax-percentage-serialize.html
// Percentages are NEVER folded inside min/max/clamp — in property contexts
// that resolve against a negative value, ordering flips.

test('WPT minmax-percentage: single-arg percent kept wrapped', () => {
  // DIVERGE from Chrome (`calc(1%)`); matches @csstools/css-calc (`min(1%)`).
  // Spec-wise, percentages shouldn't be folded inside min/max/clamp without
  // property context, so we preserve the wrapper.
  assert.equal(out('min(1%)'), 'min(1%)');
  assert.equal(out('max(1%)'), 'max(1%)');
});

test('WPT minmax-percentage: multi-arg percent preserved — NO folding', () => {
  assert.equal(out('min(1%, 2%, 3%)'), 'min(1%, 2%, 3%)');
  assert.equal(out('min(3%, 2%, 1%)'), 'min(3%, 2%, 1%)');
});

test('WPT minmax-percentage: max preserves percent args', () => {
  assert.equal(out('max(1%, 2%, 3%)'), 'max(1%, 2%, 3%)');
});

test('WPT minmax-percentage: clamp preserves when any arg is percent', () => {
  assert.equal(out('clamp(1%, 2%, 3%)'), 'clamp(1%, 2%, 3%)');
});

// --- calc-serialization-002.html (subset) --------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/calc-serialization-002.html
// Most cases here use Chrome's canonical reordering + px-normalization so
// they diverge. Pulling only the ones where neither reordering nor unit
// normalization changes the result.

test('WPT calc-serialization-002: same-family combination (ex)', () => {
  // WPT: `calc(5ex - 9ex)` → `calc(-4ex)`. Our single-value unwrap: `-4ex`.
  assert.equal(out('calc(5ex - 9ex)'), '-4ex');
});

test('WPT calc-serialization-002: cancelled percentage preserved as 0%', () => {
  // §10.10: combining same-type terms keeps the result even when zero,
  // preserving type info. Matches Chrome/WPT.
  assert.equal(out('calc(100% - 100% + 1em)'), 'calc(0% + 1em)');
});

test('WPT calc-serialization-002: cancelling percentages in the middle', () => {
  assert.equal(out('calc(100% + 1em - 100%)'), 'calc(0% + 1em)');
});

test('WPT calc-serialization-002: 0pt converts into first unit (px)', () => {
  // DIVERGE: WPT emits `calc(0px + 4vmin)` (pt→px normalization + canonical
  // reorder). We convert pt into the first-encountered length unit which
  // here is `vmin` — but vmin isn't statically convertible to pt, so the
  // 0pt term lands in the opaque bucket and comes out separately.
  assert.equal(out('calc(4vmin + 0pt)'), 'calc(4vmin + 0pt)');
});

// --- calc-invalid-parsing.html (subset our tokenizer catches) ------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/calc-invalid-parsing.html

test('WPT invalid: brackets inside calc() throw at tokenizer', () => {
  assert.throws(() => out('calc([])'), /Unexpected character/);
});

// --- round-mod-rem-computed.html (§10.3) ---------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/round-mod-rem-computed.html

test('WPT round: round(10, 10) → 10 (exact multiple)', () => {
  assert.equal(out('round(10, 10)'), '10');
});

test('WPT round: round(15, 10) → 20 (nearest, tie up)', () => {
  assert.equal(out('round(15, 10)'), '20');
});

test('WPT round: round(up, 11, 10) → 20', () => {
  assert.equal(out('round(up, 11, 10)'), '20');
});

test('WPT round: round(down, 19, 10) → 10', () => {
  assert.equal(out('round(down, 19, 10)'), '10');
});

test('WPT round: round(to-zero, -19, 10) → -10', () => {
  assert.equal(out('round(to-zero, -19, 10)'), '-10');
});

test('WPT round: round(3.7) → 4 (B defaults to 1 for <number>)', () => {
  assert.equal(out('round(3.7)'), '4');
});

test('WPT round: round on dimensional A in same unit family', () => {
  assert.equal(out('round(15px, 10px)'), '20px');
});

// --- mod cases (from round-mod-rem-computed.html) ------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/round-mod-rem-computed.html

test('WPT mod: mod(18, 5) → 3', () => {
  assert.equal(out('mod(18, 5)'), '3');
});

test('WPT mod: mod(18px, 5px) → 3px (spec example)', () => {
  assert.equal(out('mod(18px, 5px)'), '3px');
});

test('WPT mod: mod(-18px, 5px) → 2px (sign of B, spec example)', () => {
  assert.equal(out('mod(-18px, 5px)'), '2px');
});

test('WPT mod: mod(140deg, -90deg) → -40deg (spec example)', () => {
  assert.equal(out('mod(140deg, -90deg)'), '-40deg');
});

// --- rem cases (from round-mod-rem-computed.html) ------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/round-mod-rem-computed.html

test('WPT rem: rem(18, 5) → 3', () => {
  assert.equal(out('rem(18, 5)'), '3');
});

test('WPT rem: rem(-18px, 5px) → -3px (sign of A, spec example)', () => {
  assert.equal(out('rem(-18px, 5px)'), '-3px');
});

test('WPT rem: rem(140deg, -90deg) → 50deg (spec example)', () => {
  assert.equal(out('rem(140deg, -90deg)'), '50deg');
});

// --- signs-abs-computed.html (§10.6) -------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/signs-abs-computed.html

test('WPT abs: abs(-5) → 5', () => {
  assert.equal(out('abs(-5)'), '5');
});

test('WPT abs: abs(-10px) → 10px', () => {
  assert.equal(out('abs(-10px)'), '10px');
});

test('WPT abs: abs(5deg) → 5deg', () => {
  assert.equal(out('abs(5deg)'), '5deg');
});

// --- sign cases (from signs-abs-computed.html, §10.6) --------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/signs-abs-computed.html

test('WPT sign: sign(-5) → -1', () => {
  assert.equal(out('sign(-5)'), '-1');
});

test('WPT sign: sign(0) → 0', () => {
  assert.equal(out('sign(0)'), '0');
});

test('WPT sign: sign(10px) → 1 (always returns <number>)', () => {
  assert.equal(out('sign(10px)'), '1');
});

// --- sin-cos-tan-computed.html (§10.4) -----------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/sin-cos-tan-computed.html

test('WPT sin/cos/tan: sin(0) → 0', () => {
  assert.equal(out('sin(0)'), '0');
});

test('WPT sin/cos/tan: cos(0) → 1', () => {
  assert.equal(out('cos(0)'), '1');
});

test('WPT sin/cos/tan: tan(0) → 0', () => {
  assert.equal(out('tan(0)'), '0');
});

test('WPT sin/cos/tan: sin(90deg) → 1', () => {
  assert.equal(out('sin(90deg)'), '1');
});

test('WPT sin/cos/tan: cos(180deg) → -1', () => {
  assert.equal(out('cos(180deg)'), '-1');
});

test('WPT sin/cos/tan: tan(45deg) → 1 (rounded from 0.999...)', () => {
  assert.equal(out('tan(45deg)'), '1');
});

test('WPT sin/cos/tan: sin(0.25turn) → 1', () => {
  assert.equal(out('sin(0.25turn)'), '1');
});

test('WPT sin/cos/tan: cos(100grad) → 0 (rounds to precision 5)', () => {
  // 100grad = 90deg → cos = 6e-17 → rounds to 0.
  assert.equal(out('cos(100grad)'), '0');
});

test('WPT sin/cos/tan: bare number is radians — sin(pi / 2) → 1', () => {
  assert.equal(out('sin(pi / 2)'), '1');
});

// --- pi-folding into trig (covered by sin-cos-tan-computed.html cases) ---
// No standalone WPT file exists for "trig with pi"; the upstream
// computed-value tests interleave pi-folding cases with the rest.

test('WPT trig-pi: sin(pi) → 0 (rounds at precision 5)', () => {
  assert.equal(out('sin(pi)'), '0');
});

test('WPT trig-pi: cos(pi) → -1', () => {
  assert.equal(out('cos(pi)'), '-1');
});

test('WPT trig-pi: cos(2 * pi) → 1', () => {
  assert.equal(out('cos(2 * pi)'), '1');
});

test('WPT trig-pi: tan(pi / 4) → 1', () => {
  assert.equal(out('tan(pi / 4)'), '1');
});

// --- acos-asin-atan-atan2-computed.html (§10.4) --------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/acos-asin-atan-atan2-computed.html

test('WPT asin: asin(0) → 0deg', () => {
  assert.equal(out('asin(0)'), '0deg');
});

test('WPT asin: asin(1) → 90deg', () => {
  assert.equal(out('asin(1)'), '90deg');
});

test('WPT asin: asin(-1) → -90deg', () => {
  assert.equal(out('asin(-1)'), '-90deg');
});

test('WPT acos: acos(1) → 0deg', () => {
  assert.equal(out('acos(1)'), '0deg');
});

test('WPT acos: acos(-1) → 180deg', () => {
  assert.equal(out('acos(-1)'), '180deg');
});

test('WPT acos: acos(0) → 90deg', () => {
  assert.equal(out('acos(0)'), '90deg');
});

test('WPT atan: atan(0) → 0deg', () => {
  assert.equal(out('atan(0)'), '0deg');
});

test('WPT atan: atan(1) → 45deg', () => {
  assert.equal(out('atan(1)'), '45deg');
});

test('WPT atan: atan(-1) → -45deg', () => {
  assert.equal(out('atan(-1)'), '-45deg');
});

test('WPT atan: atan(infinity) → 90deg', () => {
  assert.equal(out('atan(infinity)'), '90deg');
});

// --- atan2 cases from acos-asin-atan-atan2-computed.html (§10.4.1) -------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/acos-asin-atan-atan2-computed.html

test('WPT atan2: atan2(0, 1) → 0deg', () => {
  assert.equal(out('atan2(0, 1)'), '0deg');
});

test('WPT atan2: atan2(1, 0) → 90deg', () => {
  assert.equal(out('atan2(1, 0)'), '90deg');
});

test('WPT atan2: atan2(0, -1) → 180deg', () => {
  assert.equal(out('atan2(0, -1)'), '180deg');
});

test('WPT atan2: atan2(-1, 0) → -90deg', () => {
  assert.equal(out('atan2(-1, 0)'), '-90deg');
});

test('WPT atan2: atan2(1, 1) → 45deg', () => {
  assert.equal(out('atan2(1, 1)'), '45deg');
});

test('WPT atan2: atan2(infinity, infinity) → 45deg (spec table)', () => {
  assert.equal(out('atan2(infinity, infinity)'), '45deg');
});

test('WPT atan2: same-unit dim args (1px, 1px) → 45deg', () => {
  assert.equal(out('atan2(1px, 1px)'), '45deg');
});

// --- §10.5 exponential functions (WPT pow/sqrt/hypot/log/exp) ----------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/

test('WPT pow: pow(2, 3) → 8', () => {
  assert.equal(out('pow(2, 3)'), '8');
});

test('WPT pow: pow(0, 0) → 1', () => {
  assert.equal(out('pow(0, 0)'), '1');
});

test('WPT pow: pow(2, 0.5) ≈ 1.41421', () => {
  assert.equal(out('pow(2, 0.5)'), '1.41421');
});

test('WPT pow: pow(-2, 0.5) → NaN', () => {
  assert.equal(out('pow(-2, 0.5)'), 'calc(NaN)');
});

test('WPT pow: pow(infinity, 0) → 1', () => {
  assert.equal(out('pow(infinity, 0)'), '1');
});

test('WPT sqrt: sqrt(4) → 2', () => {
  assert.equal(out('sqrt(4)'), '2');
});

test('WPT sqrt: sqrt(2) ≈ 1.41421', () => {
  assert.equal(out('sqrt(2)'), '1.41421');
});

test('WPT sqrt: sqrt(-1) → NaN', () => {
  assert.equal(out('sqrt(-1)'), 'calc(NaN)');
});

test('WPT sqrt: sqrt(infinity) → infinity', () => {
  assert.equal(out('sqrt(infinity)'), 'calc(infinity)');
});

test('WPT exp: exp(0) → 1', () => {
  assert.equal(out('exp(0)'), '1');
});

test('WPT exp: exp(1) ≈ 2.71828', () => {
  assert.equal(out('exp(1)'), '2.71828');
});

test('WPT exp: exp(-infinity) → 0', () => {
  assert.equal(out('exp(-infinity)'), '0');
});

test('WPT exp: exp(infinity) → infinity', () => {
  assert.equal(out('exp(infinity)'), 'calc(infinity)');
});

test('WPT log: log(e) → 1', () => {
  assert.equal(out('log(e)'), '1');
});

test('WPT log: log(1) → 0', () => {
  assert.equal(out('log(1)'), '0');
});

test('WPT log: log(0) → -infinity', () => {
  assert.equal(out('log(0)'), 'calc(-infinity)');
});

test('WPT log: log(-1) → NaN', () => {
  assert.equal(out('log(-1)'), 'calc(NaN)');
});

test('WPT log: log(8, 2) → 3', () => {
  assert.equal(out('log(8, 2)'), '3');
});

test('WPT log: log(100, 10) → 2', () => {
  assert.equal(out('log(100, 10)'), '2');
});

test('WPT hypot: hypot(3, 4) → 5', () => {
  assert.equal(out('hypot(3, 4)'), '5');
});

test('WPT hypot: hypot(3px, 4px) → 5px', () => {
  assert.equal(out('hypot(3px, 4px)'), '5px');
});

test('WPT hypot: hypot(infinity, 1) → infinity', () => {
  assert.equal(out('hypot(infinity, 1)'), 'calc(infinity)');
});

test('WPT hypot: hypot(-2em) → 2em (single-arg = abs)', () => {
  assert.equal(out('hypot(-2em)'), '2em');
});

// --- nan-and-infinity-{computed,serialize}.html (§10.13) ---------------

test('WPT degenerate: calc(infinity) round-trips', () => {
  assert.equal(out('calc(infinity)'), 'calc(infinity)');
});

test('WPT degenerate: calc(-infinity) round-trips', () => {
  assert.equal(out('calc(-infinity)'), 'calc(-infinity)');
});

test('WPT degenerate: calc(NaN) round-trips with canonical casing', () => {
  assert.equal(out('calc(NaN)'), 'calc(NaN)');
});

test('WPT degenerate: calc(1px / 0) → calc(infinity * 1px)', () => {
  assert.equal(out('calc(1px / 0)'), 'calc(infinity * 1px)');
});

test('WPT degenerate: calc(NaN * 1deg) → calc(NaN * 1deg)', () => {
  assert.equal(out('calc(NaN * 1deg)'), 'calc(NaN * 1deg)');
});

test('WPT degenerate: calc(infinity + infinity) → calc(infinity)', () => {
  assert.equal(out('calc(infinity + infinity)'), 'calc(infinity)');
});

test('WPT degenerate: calc(infinity - infinity) → calc(NaN)', () => {
  assert.equal(out('calc(infinity - infinity)'), 'calc(NaN)');
});

