// Edge cases of the token reducer: range bounds, end-of-file tokens inside a
// function, and parsed values that replacements must not share with the list.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, TokenType } from '@csstools/css-tokenizer';
import reduceTokens from 'postcss-calc/reduce-tokens';
import { applyReplacements, raw } from '../helpers/reduce-list.js';

const eofToken = () => tokenize({ css: '' })[0];

/** The tokens of `css` without its trailing end-of-file token. */
const bodyOf = (css) =>
  tokenize({ css }).filter((token) => token[0] !== TokenType.EOF);

describe('reduceTokens: range bounds', () => {
  test('an inverted range has no replacements', () => {
    const tokens = tokenize({ css: 'calc(1px + 2px)' });
    assert.deepEqual(reduceTokens(tokens, {}, 5, 2), []);
  });

  test('a start past the end of the list throws a RangeError', () => {
    const tokens = tokenize({ css: 'calc(1px + 2px)' });
    assert.throws(
      () => reduceTokens(tokens, {}, tokens.length + 1, 2),
      RangeError
    );
  });

  test('a negative end throws a RangeError', () => {
    const tokens = tokenize({ css: 'calc(1px + 2px)' });
    assert.throws(() => reduceTokens(tokens, {}, 0, -1), RangeError);
  });
});

describe('reduceTokens: end-of-file tokens inside a function', () => {
  test('an end-of-file token inside an unchanged function gives no replacement', () => {
    const tokens = bodyOf('calc(var(--a))');
    const list = [...tokens.slice(0, 3), eofToken(), ...tokens.slice(3)];
    assert.deepEqual(reduceTokens(list), []);
  });

  test('an end-of-file token inside a changed function is skipped', () => {
    const tokens = bodyOf('calc(1px + 2px)');
    const list = [...tokens.slice(0, 3), eofToken(), ...tokens.slice(3)];
    assert.equal(raw(applyReplacements(list, reduceTokens(list))), 'calc(3px)');
  });
});

describe('reduceTokens: end-of-file tokens at the edges of a range', () => {
  test('an end-of-file token at the start of the range is skipped', () => {
    const list = [eofToken(), ...bodyOf('calc(1px + 2px)')];
    assert.equal(raw(applyReplacements(list, reduceTokens(list))), 'calc(3px)');
  });

  test('an end-of-file token after an unchanged function does not hide the next one', () => {
    const list = [
      ...bodyOf('calc(var(--a))'),
      eofToken(),
      ...bodyOf('calc(1px + 2px)'),
    ];
    const replacements = reduceTokens(list);
    // The unchanged function and the end-of-file token come first.
    const secondCalc = bodyOf('calc(var(--a))').length + 1;
    assert.equal(replacements.length, 1);
    assert.equal(replacements[0].start, secondCalc);
    assert.equal(
      raw(applyReplacements(list, replacements)),
      'calc(var(--a))calc(3px)'
    );
  });
});

describe('reduceTokens: replacements share no parsed values with the list', () => {
  test('a replacement token has its own parsed value', () => {
    const tokens = tokenize({ css: 'calc(1px + 2px)' });
    const [replacement] = reduceTokens(tokens);
    const sourceValues = new Set(
      tokens.map((token) => token[4]).filter((value) => value != null)
    );
    for (const token of replacement.tokens) {
      if (token[4] != null) assert.equal(sourceValues.has(token[4]), false);
    }
  });
});
