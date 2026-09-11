import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize as tokenizeCss, TokenType } from '@csstools/css-tokenizer';
import { tokenize } from '../../src/lib/tokenizer.js';

test('tokenizer: passes through native CSS tokens unchanged', () => {
  const input = String.raw`/* gap */-2P\58 + var(--x\,y)`;
  assert.deepEqual(tokenize(input), tokenizeCss({ css: input }));
  assert.equal(tokenize(input)[0][0], TokenType.Comment);
  assert.equal(tokenize(input).at(-1)[0], TokenType.EOF);
});
