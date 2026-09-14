import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '@csstools/css-tokenizer';
import { indexBlocks, parse } from '../../src/lib/parser.js';
import {
  MAX_CALCULATION_DEPTH,
  CalculationLimitError,
} from '../../src/lib/limits.js';

const nested = (depth) => `${'unknown('.repeat(depth)}x${')'.repeat(depth)}`;

const tokenIndex = (tokens, raw, occurrence = 0) => {
  let seen = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i][1] !== raw) continue;
    if (seen++ === occurrence) return i;
  }
  return -1;
};

test('BlockIndex navigates mixed nested delimiters and top-level commas', () => {
  const tokens = tokenize({ css: 'f(a, [b, {c, d}], e), z' });
  const index = indexBlocks(tokens);
  const open = tokenIndex(tokens, 'f(');
  const close = tokenIndex(tokens, ')');
  const square = tokenIndex(tokens, '[');
  const firstComma = tokenIndex(tokens, ',', 0);
  const secondComma = tokenIndex(tokens, ',', 3);

  assert.equal(index.closeOf(open), close);
  assert.equal(index.nextComponent(open, tokens.length), close + 1);
  assert.equal(index.nextComponent(square, close), tokenIndex(tokens, ']') + 1);
  assert.equal(index.firstTopLevelComma(open + 1, close), firstComma);
  assert.equal(index.firstTopLevelComma(firstComma + 1, close), secondComma);
  assert.equal(index.maxDepth, 3);
});

test('BlockIndex preserves the opener stack across a genuine mismatch', () => {
  const tokens = tokenize({ css: 'f([a), b]' });
  const index = indexBlocks(tokens);
  const open = tokenIndex(tokens, 'f(');
  const square = tokenIndex(tokens, '[');
  const squareClose = tokenIndex(tokens, ']');

  assert.equal(index.closeOf(open), -1);
  assert.equal(index.closeOf(square), squareClose);
  assert.equal(index.nextComponent(open, tokens.length), open + 1);
  assert.equal(index.nextComponent(square, tokens.length), squareClose + 1);
});

test('BlockIndex bounds closeOf and nextComponent by an exclusive end', () => {
  const tokens = tokenize({ css: 'f(a), b' });
  const index = indexBlocks(tokens);
  const open = tokenIndex(tokens, 'f(');
  const close = tokenIndex(tokens, ')');

  assert.equal(index.closeOf(open, close), -1);
  assert.equal(index.closeOf(open, close + 1), close);
  assert.equal(index.closeOf(open, tokens.length + 10), close);
  assert.equal(index.nextComponent(open, close), open + 1);
  assert.equal(index.nextComponent(open, close + 1), close + 1);
  assert.equal(index.nextComponent(close, close), close);
  assert.equal(index.nextComponent(close + 1, close), close);
});

test('BlockIndex tolerates unmatched openers without rejecting the stream', () => {
  const tokens = tokenize({ css: 'f([a, b]' });
  const index = indexBlocks(tokens);

  assert.equal(index.maxDepth, 2);
  assert.doesNotThrow(() => indexBlocks(tokens));
});

test('opaque component traversal is iterative at the nesting limit', () => {
  assert.doesNotThrow(() =>
    parse(tokenize({ css: nested(MAX_CALCULATION_DEPTH + 1) }))
  );
  let error;
  try {
    parse(tokenize({ css: nested(MAX_CALCULATION_DEPTH + 2) }));
  } catch (candidate) {
    error = candidate;
  }
  assert.ok(error instanceof CalculationLimitError);
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'CalculationLimitError');
  assert.equal(error.limit, MAX_CALCULATION_DEPTH);
  assert.equal(error instanceof RangeError, false);
});
