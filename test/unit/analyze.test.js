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
