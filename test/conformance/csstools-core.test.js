// Cribbed from @csstools/css-calc test corpus:
//   https://github.com/csstools/postcss-plugins/tree/main/packages/css-calc/test
//
// Each test cites its source file. Cases selected where our pipeline
// produces the same output as csstools. Deliberately excluded:
//   - csstools `globals` option (variable substitution) — not in our scope
//   - relative-color math (`rgb(from ...)`) — out of scope
//   - exponential family (pow/sqrt/hypot/log/exp) — not yet implemented
//   - cases where floating-point serialization precision differs (we use
//     `precision: false` to emit full-float, but csstools occasionally
//     rounds at ~15 significant figures in its own way)
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { out as pipeline } from '../helpers/out.js';

/** Full-precision output, matching csstools' default. */
const out = (input) => pipeline(input, { precision: false });

// --- basic/test.js -------------------------------------------------------
// One representative keeps arithmetic precedence and explicit grouping here;
// focused parser/simplifier and grammar properties cover the overlapping
// plain add/subtract/multiply examples.
test('csstools basic: precedence and parenthesized division', () => {
  assert.equal(out('calc(15 / (5 / 3))'), '9');
  assert.equal(out('calc(2 * 3 + 7 * 5)'), '41');
});

// --- wpt/calc-unit-analysis.js ------------------------------------------
describe('csstools unit-analysis', () => {
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
});
// --- wpt/calc-time-values.js --------------------------------------------
test('csstools time: compatible units divide to a number', () => {
  assert.equal(out('calc(8s / 2s)'), '4');
});

// --- wpt/calc-angle-values.js -------------------------------------------
test('csstools angle: compatible angle sum', () => {
  assert.equal(out('calc(0.5turn + 0.5turn)'), '1turn');
});

// --- wpt/minmax-percentage-computed.js ----------------------------------
// csstools preserves percent inside min/max/clamp unconditionally.
describe('csstools minmax-%:', () => {
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
});
// --- wpt/minmax-integer-computed.js (number-typed min/max) --------------
describe('csstools minmax-int: Max Of', () => {
  test('csstools minmax-int: min of integers folds', () => {
    assert.equal(out('min(1, 2, 3)'), '1');
  });

  test('csstools minmax-int: max of integers folds', () => {
    assert.equal(out('max(1, 2, 3)'), '3');
  });

  test('csstools minmax-int: single-arg min of number folds', () => {
    assert.equal(out('min(1)'), '1');
  });
});

// --- wpt/minmax-time-computed.js (same-unit cases) ----------------------
test('csstools minmax-time: min of seconds', () => {
  assert.equal(out('min(1s, 2s, 3s)'), '1s');
});

test('csstools minmax-time: max of seconds', () => {
  assert.equal(out('max(1s, 2s, 3s)'), '3s');
});

// --- wpt/max-20-arguments.js --------------------------------------------
test('csstools max-20: max with many numeric args folds', () => {
  assert.equal(
    out(
      'max(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20)'
    ),
    '20'
  );
});

// --- wpt/calc-in-calc.js ------------------------------------------------
test('csstools calc-in-calc: nested calculation flattens', () => {
  assert.equal(out('calc(calc(1px + 2px))'), '3px');
});

// --- wpt/clamp-length-computed.js (same-unit, fully-resolvable) ---------
test('csstools clamp: middle value selected', () => {
  assert.equal(out('clamp(1px, 2px, 3px)'), '2px');
});

describe('csstools clamp', () => {
  test('csstools clamp: min cap applied', () => {
    assert.equal(out('clamp(5px, 2px, 10px)'), '5px');
  });

  test('csstools clamp: max cap applied', () => {
    assert.equal(out('clamp(1px, 10px, 5px)'), '5px');
  });
});

// --- basic/none-in-clamp.js (subset) ------------------------------------
// clamp(none, ...) uses keyword `none` as unbounded per §10.5.3.
test('csstools none-in-clamp: none as lower bound folds via min()', () => {
  assert.equal(out('clamp(none, 10px, 20px)'), '10px');
});

test('csstools none-in-clamp: none as upper bound folds via max()', () => {
  assert.equal(out('clamp(1px, 10px, none)'), '10px');
});

// --- wpt/invalid.js (subset our tokenizer/parser rejects) ---------------
test('csstools invalid: empty calc throws', () => {
  assert.throws(() => out('calc()'), /takes exactly one argument/);
});

describe('csstools invalid: Trailing Operator', () => {
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
});

// --- @csstools/css-calc round/mod/rem/abs/sign fixtures ------------------
// Cribbed from packages/css-calc/test for the stepped/sign-related suite.
describe('csstools round/mod/rem/abs/sign', () => {
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
    assert.equal(out('round(to-zero, -1.9, 1)'), 'calc(-1)');
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
    assert.equal(out('mod(18, -5)'), 'calc(-2)');
  });

  test('csstools rem: spec examples', () => {
    assert.equal(out('rem(18, 5)'), '3');
    assert.equal(out('rem(-18, 5)'), 'calc(-3)');
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
    assert.equal(out('sign(-5)'), 'calc(-1)');
    assert.equal(out('sign(5)'), '1');
    assert.equal(out('sign(0)'), '0');
    assert.equal(out('sign(-5px)'), 'calc(-1)');
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
});
