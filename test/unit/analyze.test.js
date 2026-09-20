import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../src/lib/analyze.js';
import { call, num } from '../../src/lib/node.js';
import { indexBlocks } from '../../src/lib/block-index.js';
import { parse } from '../../src/lib/parser.js';
import reduceCalc from '../../src/reduce.js';
import { tokenize } from '@csstools/css-tokenizer';

function analyzeSource(source) {
  const tokens = tokenize({ css: source });
  return analyze(parse(tokens, 0, tokens.length, indexBlocks(tokens)));
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
  // Both operands resolve in the same percentage context, so the quotient is
  // a definite number even though its value cannot be known statically.
  assert.equal(reduceCalc('calc(0% / 0%)'), 'calc(NaN)');
  assert.equal(reduceCalc('calc(10% / 0%)'), 'calc(infinity)');
});

test('reduceCalc: adds a percentage to a reduced percentage ratio', () => {
  // The ratio is known to be a number, so the sum keeps only the remaining
  // contextual percentage instead of preserving both operands.
  assert.equal(reduceCalc('calc(10% / 5% + 1%)'), 'calc(2 + 1%)');
  assert.deepEqual(analyzeSource('10% / 5% + 1%'), {
    type: 'number',
    valid: true,
    unresolved: true,
  });
  // The coarse typing still rejects a concrete dimension beside the ratio.
  assert.deepEqual(analyzeSource('10% / 5% + 1% + 1px'), {
    type: 'unknown',
    valid: false,
    unresolved: true,
  });
});

test('analyze: a non-percentage denominator survives percentage ratio cancellation', () => {
  assert.deepEqual(analyzeSource('10% / 5% / var(--x)'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('10% / (5% * var(--x))'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
});

test('analyze: a percentage ratio combined with a concrete dimension', () => {
  assert.deepEqual(analyzeSource('10% / 5% * 10px'), {
    type: { dimension: 'length' },
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('10% / 5% * 10px + 20px'), {
    type: { dimension: 'length' },
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('10% / 5% * 10px + 1'), {
    type: 'unknown',
    valid: false,
    unresolved: true,
  });
});

test('analyze: atan2 never leaks its arguments percentage type', () => {
  // The atan2() type table gives «["angle" → 1]»; an unresolved result is
  // plain unknown, so a surrounding product cannot cancel it against `%`.
  assert.deepEqual(analyzeSource('atan2(10%, 5%)'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('atan2(10%, 5%) / 10%'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
});

test('reduceCalc: treats an atan2 percentage ratio like an opaque ratio', () => {
  // Both forms are unknown-typed ratios, so both reduce instead of the
  // concrete one regressing to a preserved invalid sum.
  assert.equal(
    reduceCalc('calc(atan2(10%, 5%) / 10% + 1px)'),
    'calc(1px + 1 / 10% * atan2(10%, 5%))'
  );
  assert.equal(
    reduceCalc('calc(atan2(var(--x), 5%) / 10% + 1px)'),
    'calc(1px + 1 / 10% * atan2(var(--x), 5%))'
  );
});

test('analyze: a percentage-preserving builtin keeps its contextual type', () => {
  // abs() passes its argument type through, so the ratio still cancels to
  // a number exactly like a bare `10% / 10%`.
  assert.deepEqual(analyzeSource('abs(10%) / 10%'), {
    type: 'number',
    valid: true,
    unresolved: true,
  });
});

test('analyze: a percentage mixed with an opaque term does not cancel', () => {
  // The sum loses the guarantee that its value resolves in the percentage
  // context, so the surrounding product must not cancel it against `%`.
  assert.deepEqual(analyzeSource('(10% + var(--x)) / 5%'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
});

test('analyze: an unpaired percentage in a product stays unknown', () => {
  // A product never returns a percentage, so its leftover percentage cannot
  // participate in a later cancellation; the conservative unknown type only
  // ever under-validates, never over-cancels.
  assert.deepEqual(analyzeSource('10% * 2'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
  // Percentages only cancel as a pair within the same product.
  assert.deepEqual(analyzeSource('10% * 2 / 5%'), {
    type: 'number',
    valid: true,
    unresolved: true,
  });
});

test('analyze: opaque numerator products retain known dimension constraints', () => {
  assert.deepEqual(analyzeSource('var(--x) * 10px'), {
    type: { dimension: 'length' },
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('var(--x) * 10px + 5'), {
    type: 'unknown',
    valid: false,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('var(--x) * 10s + 5'), {
    type: 'unknown',
    valid: false,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('var(--x) * 10s'), {
    type: { dimension: 'time' },
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('var(--x) * 10deg + 1rad'), {
    type: { dimension: 'angle' },
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('var(--x) * 10hz + 1khz'), {
    type: { dimension: 'frequency' },
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('var(--a) * var(--b) * 10px + 5'), {
    type: 'unknown',
    valid: false,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('10px / var(--x)'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
});

test('analyze: rejects sum when multiple incompatible dimensions surround an unresolved term', () => {
  assert.deepEqual(analyzeSource('10px + var(--x) + 5s'), {
    type: 'unknown',
    valid: false,
    unresolved: true,
  });
});

test('analyze: round() validates arity, types, and single-argument rules', () => {
  assert.deepEqual(analyzeSource('round(5)'), {
    type: 'number',
    valid: true,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('round(up, 5)'), {
    type: 'number',
    valid: true,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('round(var(--x))'), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
  assert.deepEqual(analyzeSource('round(10px)'), {
    type: 'unknown',
    valid: false,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('round(up, 10px)'), {
    type: 'unknown',
    valid: false,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('round(10px, 20s)'), {
    type: 'unknown',
    valid: false,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('round(10px, 20px)'), {
    type: { dimension: 'length' },
    valid: true,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('round()'), {
    type: 'unknown',
    valid: false,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('round(1px, 2px, 3px)'), {
    type: 'unknown',
    valid: false,
    unresolved: false,
  });
});

test('analyze: clamp() validates keywords and matching types', () => {
  assert.deepEqual(analyzeSource('clamp(none, 10px, none)'), {
    type: { dimension: 'length' },
    valid: true,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('clamp(10s, 10px, 20px)'), {
    type: 'unknown',
    valid: false,
    unresolved: false,
  });
  assert.deepEqual(analyzeSource('clamp(10px, 20px)'), {
    type: 'unknown',
    valid: false,
    unresolved: false,
  });
});

test('analyze: checks invalid product children after opaque factors', () => {
  const expected = {
    type: 'unknown',
    valid: false,
    unresolved: true,
  };
  assert.deepEqual(analyzeSource('var(--x) * sqrt(1px)'), expected);
  assert.deepEqual(analyzeSource('sqrt(1px) * var(--x)'), expected);
  assert.deepEqual(analyzeSource('var(--x) * calc(1px + 1s)'), expected);
});

test('analyze: rejects invalid known product dimensions around opaque factors', () => {
  const expected = {
    type: 'unknown',
    valid: false,
    unresolved: true,
  };
  assert.deepEqual(analyzeSource('1px * 2px * var(--x) * 3px'), expected);
  assert.deepEqual(analyzeSource('1px / 2px / var(--x) / 3px'), expected);
  assert.deepEqual(analyzeSource('1px / var(--x) / 1s'), expected);
});

test('analyze: enforces the calculation depth limit', () => {
  let tree = num(1);
  for (let depth = 0; depth < 1025; depth++) {
    tree = call('abs', [tree]);
  }
  assert.throws(
    () => analyze(tree),
    /Calculation nesting exceeds the limit of 1024/
  );
});

test('analyze: treats inherited object names as unknown functions', () => {
  assert.deepEqual(analyze(call('toString', [])), {
    type: 'unknown',
    valid: true,
    unresolved: true,
  });
});
