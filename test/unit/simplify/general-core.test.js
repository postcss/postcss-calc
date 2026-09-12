import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.js';

// --- Mutation-targeted tests (kill specific surviving mutants) -----------
test('simplify: sum of only numbers that cancel to zero → bare 0', () => {
  // Exercises `hasNum && numTotal !== 0` branch — when numTotal === 0
  // we must NOT emit a Num term. Output is mkSum([]) → Num(0) default.
  assert.equal(out('calc(1 - 1)'), '0');
});

describe('simplify: Sum With', () => {
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
});

describe('cancel: Different-base Numerator/denominator', () => {
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
});

describe('fold: First-arg Establishes', () => {
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
});

describe('simplify: Dim(0 As', () => {
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
});

// --- Opaque leaves -------------------------------------------------------
//
// Opaque leaves: var(), env(), attr(), and unknown functions. Simplification
// flows around them; resolvable neighbors still combine.
test('opaque: var() passes through', () => {
  assert.equal(out('calc(var(--x))'), 'var(--x)');
});

describe('opaque: Var( With', () => {
  test('opaque: var() with a fallback', () => {
    assert.equal(out('calc(var(--x, 10px))'), 'var(--x, 10px)');
  });

  test('opaque: var() nested inside a calc() with combinable neighbors', () => {
    assert.equal(out('calc(1px + var(--x) + 2px)'), 'calc(3px + var(--x))');
  });

  test('opaque: same-unit terms fold, opaque preserved on the right', () => {
    assert.equal(out('calc(10px - 3px + var(--x))'), 'calc(7px + var(--x))');
  });

  test('opaque: subtraction of opaque preserved', () => {
    assert.equal(out('calc(10px - var(--x))'), 'calc(10px - var(--x))');
  });
});

// §10.12 serialization: resolvable terms come first, opaque after.
test('opaque: env() passes through', () => {
  assert.equal(
    out('calc(env(safe-area-inset-top) + 10px)'),
    'calc(10px + env(safe-area-inset-top))'
  );
});

describe('opaque: Attr( Passes', () => {
  test('opaque: attr() passes through', () => {
    assert.equal(out('calc(attr(data-x) + 1px)'), 'calc(1px + attr(data-x))');
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
    assert.equal(out('calc(var(--x, calc(1px + 2px)))'), 'var(--x, 3px)');
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
});

test('opaque / opaque preserved (no static cancellation)', () => {
  // Two opaque Calls give us no type info to cancel; preserve the Product.
  assert.equal(out('calc(var(--a) / var(--b))'), 'calc(var(--a) / var(--b))');
});

describe('opaque: Resolvables On', () => {
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
});
