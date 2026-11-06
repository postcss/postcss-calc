// A token list may hold EOF tokens in its middle, as concatenated `tokenize`
// results do. Such tokens are not CSS: they must not be copied into a
// replacement, and they must not stop the tokens after them from being read.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '@csstools/css-tokenizer';
import reduceTokens from 'postcss-calc/reduce-tokens';
import { applyReplacements, raw } from '../helpers/reduce-list.js';

const unwrap = { unwrapSingleValue: true };
const EOF = ['EOF-token', '', 0, 0, undefined];

describe('reduceTokens: EOF tokens in the middle of a list', () => {
  test('a later replacement is found and the EOF token is not copied', () => {
    // The first part has an opaque fallback that holds a source range, so the
    // replacement inside it reuses source tokens by index.
    const first = tokenize({ css: 'var(--x, calc(1px + 2px) 3px)' });
    const second = tokenize({ css: ' calc(4px + 5px)' });
    const tokens = [...first.slice(0, -1), EOF, ...second];

    const replacements = reduceTokens(tokens, unwrap);

    assert.deepEqual(
      replacements.map(({ start, end, tokens: next }) => [
        start,
        end,
        raw(next),
      ]),
      [
        [4, 11, '3px'],
        [16, 23, '9px'],
      ]
    );
    for (const { tokens: next } of replacements) {
      assert.ok(next.every((token) => token[0] !== 'EOF-token'));
    }
    assert.equal(
      raw(applyReplacements(tokens, replacements)),
      'var(--x, 3px 3px) 9px'
    );
  });
});
