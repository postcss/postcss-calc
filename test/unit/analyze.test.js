import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../src/lib/analyze.js';
import { checkCalculationType } from '../../src/lib/calculation-type.js';
import { call, num } from '../../src/lib/node.js';
import { indexBlocks } from '../../src/lib/block-index.js';
import { parse } from '../../src/lib/parser.js';
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
  assert.throws(
    () => checkCalculationType(tree),
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
