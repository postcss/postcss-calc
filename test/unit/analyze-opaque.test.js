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
