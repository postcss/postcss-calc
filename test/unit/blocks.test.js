// Block matching over a range of a token list: a function the range does not
// close is unclosed, and an empty or inverted range has nothing to reduce.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '@csstools/css-tokenizer';
import reduceTokens from 'postcss-calc/reduce-tokens';

const tokens = tokenize({ css: 'a calc(1px + 2px) b' });
const opener = tokens.findIndex((token) => token[1] === 'calc(');
const closer = tokens.findIndex((token) => token[1] === ')');

describe('reduceTokens: block ranges', () => {
  test('a range covering the function replaces it', () => {
    const [replacement] = reduceTokens(tokens, {}, opener, closer + 1);
    assert.deepEqual(
      [replacement.start, replacement.end],
      [opener, closer + 1]
    );
  });

  test('a range ending before the closer leaves the function unclosed and unreduced', () => {
    const errors = [];
    const replacements = reduceTokens(
      tokens,
      { onParseError: (error) => errors.push(error.message) },
      opener,
      closer
    );
    assert.deepEqual(replacements, []);
    assert.equal(errors.length, 1);
  });

  test('a range starting after the opener has nothing to reduce', () => {
    assert.deepEqual(reduceTokens(tokens, {}, opener + 1, tokens.length), []);
  });
});

describe('reduceTokens: empty ranges', () => {
  test('an empty or inverted range has no replacements', () => {
    assert.deepEqual(reduceTokens(tokens, {}, 3, 3), []);
    assert.deepEqual(reduceTokens(tokens, {}, 5, 2), []);
  });

  test('a range outside the list or with a fractional bound throws a RangeError', () => {
    for (const [start, end] of [
      [0, tokens.length + 1],
      [-1, 3],
      [0.5, 3],
      [0, Number.NaN],
      [tokens.length + 1, tokens.length + 2],
    ]) {
      assert.throws(() => reduceTokens(tokens, {}, start, end), RangeError);
    }
  });
});
