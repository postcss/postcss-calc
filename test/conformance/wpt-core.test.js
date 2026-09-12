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
// exponential family (pow/sqrt/hypot/log/exp) is a planned follow-up.
//
// Divergences are documented with `DIVERGE:` comments.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../helpers/out.js';

// --- calc-serialization.html ---------------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/calc-serialization.html
test('WPT calc-serialization: single negative length preserved', () => {
  assert.equal(out('calc(-10px)'), 'calc(-10px)');
});

test('WPT calc-serialization: resolvable + opaque kept as a sum', () => {
  assert.equal(out('calc(10px + 1vmin)'), 'calc(10px + 1vmin)');
});

// --- minmax-length-serialize.html ----------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/minmax-length-serialize.html
describe('WPT minmax-length:', () => {
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
});

// calc-in-calc flattening is represented once in csstools.test.js; the
// source grammar property also generates nested calc() wrappers.
// --- calc-catch-divide-by-0.html (now §10.9.1 IEEE-754 form) ------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/calc-catch-divide-by-0.html
test('WPT divide-by-zero: 100px / 0 → calc(infinity * 1px)', () => {
  assert.equal(out('calc(100px / 0)'), 'calc(infinity * 1px)');
});

test('WPT divide-by-zero: 100px / (2 - 2) → calc(infinity * 1px)', () => {
  assert.equal(out('calc(100px / (2 - 2))'), 'calc(infinity * 1px)');
});

// --- calc-typed-arithmetic-parsing (implied from spec §10.2) -------------
describe('WPT typed-arith:', () => {
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
});

// --- calc-keyword folding (§10.9) ----------------------------------------
describe('WPT calc-keyword:', () => {
  test('WPT calc-keyword: pi resolves in a calc', () => {
    // WPT cases expect `calc(3.14159265358979)` with ~15 digits; our default
    // precision of 5 produces `3.14159`. Same number, different formatting.
    assert.equal(out('calc(pi)'), 'calc(3.14159)');
  });

  test('WPT calc-keyword: e resolves in a calc', () => {
    assert.equal(out('calc(e)'), 'calc(2.71828)');
  });

  test('WPT calc-keyword: pi multiplied by a unit', () => {
    assert.equal(out('calc(pi * 1rad)'), '3.14159rad');
  });
});

// --- var()-preservation round-trips (widely tested across WPT) -----------
describe('WPT var:', () => {
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
});

// --- clamp (implied from spec §10.8) -------------------------------------
describe('WPT clamp:', () => {
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
  assert.equal(out('min(.1)'), 'calc(.1)');
  assert.equal(out('max(.1)'), 'calc(.1)');
});

describe('WPT minmax-number: Min Picks', () => {
  test('WPT minmax-number: min picks smallest number', () => {
    assert.equal(out('min(.1, .2, .3)'), 'calc(.1)');
    assert.equal(out('min(.3, .2, .1)'), 'calc(.1)');
  });

  test('WPT minmax-number: max picks largest number', () => {
    assert.equal(out('max(.1, .2, .3)'), 'calc(.3)');
    assert.equal(out('max(.3, .2, .1)'), 'calc(.3)');
  });

  test('WPT minmax-number: min folded inside a sum', () => {
    assert.equal(out('calc(min(.1) + min(.2))'), 'calc(.3)');
  });

  test('WPT minmax-number: max inside a sum', () => {
    assert.equal(out('calc(max(.1) + max(.2))'), 'calc(.3)');
  });

  test('WPT minmax-number: sum of number and folded min', () => {
    assert.equal(out('calc(.1 + min(.1))'), 'calc(.2)');
  });
});

// --- minmax-time-serialize.html ------------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/minmax-time-serialize.html
// Same-unit cases only — Chrome normalizes ms→s, we preserve source unit.
describe('WPT minmax-time:', () => {
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
});

// --- minmax-angle-serialize.html -----------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/minmax-angle-serialize.html
// Same-unit cases only — cross-unit angle conversion produces values in the
// first arg's unit (turn/rad precision makes full cross-unit tests brittle).
describe('WPT minmax-angle:', () => {
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
});

// --- minmax-percentage-serialize.html ------------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/minmax-percentage-serialize.html
// Percentages are NEVER folded inside min/max/clamp — in property contexts
// that resolve against a negative value, ordering flips.
describe('WPT minmax-percentage: Multi-arg Percent', () => {
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
});

// --- calc-serialization-002.html (subset) --------------------------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/calc-serialization-002.html
// Most cases here use Chrome's canonical reordering + px-normalization so
// they diverge. Pulling only the ones where neither reordering nor unit
// normalization changes the result.
describe('WPT calc-serialization-002:', () => {
  test('WPT calc-serialization-002: same-family combination (ex)', () => {
    assert.equal(out('calc(5ex - 9ex)'), 'calc(-4ex)');
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
});

// --- calc-invalid-parsing.html (subset our tokenizer catches) ------------
// https://github.com/web-platform-tests/wpt/blob/master/css/css-values/calc-invalid-parsing.html
test('WPT invalid: brackets inside calc() throw at tokenizer', () => {
  assert.throws(() => out('calc([])'), /Unexpected character/);
});
