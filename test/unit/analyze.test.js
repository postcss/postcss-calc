import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../src/lib/analyze.js';
import reduceCalc from '../../src/reduce.js';
import { parseSource } from '../helpers/parse-source.js';

function analyzeSource(source) {
  return analyze(parseSource(source));
}

test('analyze: reports CSS type and validity in one result', () => {
  assert.deepEqual(analyzeSource('1px + 2px'), {
    type: { dimension: 'length' },
    valid: true,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('1px + 1s'), {
    type: 'unknown',
    valid: false,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('sqrt(1px)'), {
    type: 'unknown',
    valid: false,
    unresolved: false,
  });
});

test('analyze: tracks unresolved values without confusing grammar keywords', () => {
  assert.deepEqual(analyzeSource('sin(var(--angle))'), {
    type: 'number',
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('clamp(none, 10px, 20px)'), {
    type: { dimension: 'length' },
    valid: true,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('round(up, 5px, 2px)'), {
    type: { dimension: 'length' },
    valid: true,
    unresolved: false,
  });
});

test('analyze: sign() always returns number at valid arity', () => {
  assert.deepEqual(analyzeSource('sign(10px)'), {
    type: 'number',
    valid: true,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('sign(10%)'), {
    type: 'number',
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('sign(var(--x))'), {
    type: 'number',
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('sign()'), {
    type: 'unknown',
    valid: false,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('sign(1px, 2px)'), {
    type: 'unknown',
    valid: false,
    unresolved: false,
  });
});

test('reduceCalc: accepts a calculation containing sign() of a dimension', () => {
  assert.equal(reduceCalc('calc(sign(10px) + 1)'), 'calc(2)');
});

test('reduceCalc: preserves an invalid sum hidden by an unresolved term', () => {
  assert.equal(
    reduceCalc('calc(0% * 0px / 0px + 0px + -1 * 0)'),
    'calc(0% * 0px / 0px + 0px + -1 * 0)'
  );
});

test('reduceCalc: preserves a length added to a percentage ratio', () => {
  assert.equal(
    reduceCalc('calc(0% / 0% + 0px + 0px + 0px)'),
    'calc(0% / 0% + 0px + 0px + 0px)'
  );
});

test('reduceCalc: reduces a valid percentage ratio to its scalar quotient', () => {
  assert.equal(reduceCalc('calc(10% / 5%)'), 'calc(2)');
  // Percentage-ness survives sum and call wrappers, so these are the same
  // ratio and reduce to the same scalar.
  assert.equal(reduceCalc('calc(calc(10%) / 5%)'), 'calc(2)');
  assert.equal(reduceCalc('calc((10% + 5%) / 5%)'), 'calc(3)');
});

test('reduceCalc: preserves an invalid sum of incompatible types through an unresolved term', () => {
  assert.equal(
    reduceCalc('calc(2 * (0% + -1) + round(0turn, 1turn))'),
    'calc(2 * (0% + -1) + round(0turn, 1turn))'
  );
});

test('analyze: rejects sum when unresolved term is constrained to a type incompatible with other terms', () => {
  assert.deepEqual(analyzeSource('2 * (0% + -1) + round(0turn, 1turn)'), {
    type: 'unknown',
    valid: false,
    unresolved: true,
  });
});

test('analyze: resolves sum type when unresolved term is constrained by a dimension', () => {
  assert.deepEqual(analyzeSource('10% + 20px'), {
    type: { dimension: 'length' },
    valid: true,
    unresolved: true,
  });
});

test('analyze: a percentage product retains its known numerator dimension', () => {
  assert.deepEqual(analyzeSource('0% * 0 * 0px'), {
    type: { dimension: 'length' },
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('0% * 0 * 0px + 0'), {
    type: 'unknown',
    valid: false,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('0% / 1px'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
});

test('analyze: a percentage ratio is a number before simplification', () => {
  assert.deepEqual(analyzeSource('10% / 5%'), {
    type: 'number',
    valid: true,
    unresolved: true,
  });
  // The ratio is a number, so adding a length is a definite type error even
  // though the original percentage operands are contextual.
  assert.deepEqual(analyzeSource('10% / 5% + 1px'), {
    type: 'unknown',
    valid: false,
    unresolved: true,
  });
  // A non-percentage numerator must survive the cancellation of `% / %`.
  assert.deepEqual(analyzeSource('10% / 5% * var(--x)'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
});

test('analyze: a percentage ratio is a number through sum and call wrappers', () => {
  // Percentages typed through wrappers resolve in the same context as their
  // peers, so the contextual type still cancels across `% / %`.
  for (const numerator of ['calc(10%)', '(10% + 5%)', 'min(10%, 20%)']) {
    assert.deepEqual(analyzeSource(`${numerator} / 5%`), {
      type: 'number',
      valid: true,
      unresolved: true,
    });
    assert.deepEqual(analyzeSource(`${numerator} / 5% + 1px`), {
      type: 'unknown',
      valid: false,
      unresolved: true,
    });
  }
  // An opaque sibling argument could resolve outside the percentage context,
  // so the wrapped value is no longer known to be a percentage.
  assert.deepEqual(analyzeSource('min(10%, var(--x)) / 5%'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
});

test('analyze: only paired percentage factors cancel in a product', () => {
  // One pair cancels and one numerator percentage remains contextual.
  assert.deepEqual(analyzeSource('10% * 20% / 5%'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
  // One pair cancels and one denominator percentage remains contextual.
  assert.deepEqual(analyzeSource('10% / 5% / 2%'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
  // Two pairs cancel completely, leaving a bare number.
  assert.deepEqual(analyzeSource('(10% * 20%) / (5% * 2%)'), {
    type: 'number',
    valid: true,
    unresolved: true,
  });
});

test('analyze: percentage-preserving builtins propagate the contextual type', () => {
  // mod(), round(), and hypot() return their arguments' type through
  // matchingArguments()/addTypes(), and clamp() with a `none` keyword at a
  // MIN/MAX position skips the keyword, so each keeps its arguments' pure
  // percentage type and the surrounding product cancels `% / %` to a number.
  for (const value of [
    'mod(10%, 5%)',
    'round(10%, 5%)',
    'hypot(10%, 20%)',
    'clamp(none, 10%, 30%)',
    'clamp(10%, 30%, none)',
  ]) {
    assert.deepEqual(analyzeSource(`${value} / 5%`), {
      type: 'number',
      valid: true,
      unresolved: true,
    });
    assert.deepEqual(analyzeSource(`${value} / 5% + 1px`), {
      type: 'unknown',
      valid: false,
      unresolved: true,
    });
  }
  // A `none` in the middle argument is not recognized as a keyword, so it is
  // an opaque term that breaks the same-percentage-context guarantee.
  assert.deepEqual(analyzeSource('clamp(10%, none, 30%) / 5%'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
});

test('reduceCalc: reduces percentage ratios through percentage-preserving builtins', () => {
  // Each wrapped percentage still cancels against the denominator, so the
  // ratios reduce to the same scalar-quotient form as a bare ratio.
  assert.equal(
    reduceCalc('calc(mod(10%, 5%) / 5%)'),
    'calc(1 / 5% * mod(10%, 5%))'
  );
  assert.equal(
    reduceCalc('calc(round(10%, 5%) / 5%)'),
    'calc(1 / 5% * round(10%, 5%))'
  );
  assert.equal(
    reduceCalc('calc(hypot(10%, 20%) / 10%)'),
    'calc(1 / 10% * hypot(10%, 20%))'
  );
  assert.equal(
    reduceCalc('calc(clamp(none, 10%, 30%) / 10%)'),
    'calc(1 / 10% * min(10%, 30%))'
  );
});

test('reduceCalc: serializes non-finite percentage ratios', () => {
  assert.equal(reduceCalc('calc(0% / 0%)'), 'calc(NaN)');
  assert.equal(reduceCalc('calc(10% / 0%)'), 'calc(infinity)');
});

test('reduceCalc: adds a percentage to a reduced percentage ratio', () => {
  assert.equal(reduceCalc('calc(10% / 5% + 1%)'), 'calc(2 + 1%)');
  assert.deepEqual(analyzeSource('10% / 5% + 1%'), {
    type: 'number',
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('10% / 5% + 1% + 1px'), {
    type: 'unknown',
    valid: false,
    unresolved: true,
  });
});
