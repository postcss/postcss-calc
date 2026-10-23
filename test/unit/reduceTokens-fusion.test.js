// A replacement must not merge with the token beside it or with a printed
// neighbour: the edited list has to read back as the tokens it holds.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '@csstools/css-tokenizer';
import reduceCalc from 'postcss-calc/reduce';
import reduceTokens from 'postcss-calc/reduce-tokens';
import { applyReplacements, raw } from '../helpers/reduce-list.js';

const unwrap = { unwrapSingleValue: true };

const retokenized = (tokens) =>
  tokenize({ css: raw(tokens) }).map((token) => [token[0], token[1]]);

const cases = [
  [
    'an escape after a printed dimension',
    'calc(var(--x, calc(1px)\\62) + 1px)',
  ],
  ['a percent sign after a printed number', 'calc(var(--x, calc(1)%) + 1px)'],
  ['an identifier after the replaced function', 'foo(calc(1px + 1px)b)'],
  ['an identifier after a negative zero', 'foo(calc(-0)x)'],
  ['a percent sign after the replaced function', 'foo(calc(1px + 1px)%)'],
  ['an escape after the replaced function', 'foo(calc(1px + 1px)\\62)'],
];

describe('reduceTokens: the edited list reads back as its own tokens', () => {
  for (const [name, value] of cases) {
    test(name, () => {
      const tokens = tokenize({ css: value });
      const edited = applyReplacements(tokens, reduceTokens(tokens, unwrap));
      assert.deepEqual(
        edited.filter((t) => t[0] !== 'EOF-token').map((t) => [t[0], t[1]]),
        retokenized(edited).filter((t) => t[0] !== 'EOF-token')
      );
    });
  }
});

describe('reduceCalc: unwrapped results keep their neighbours apart', () => {
  test('the number before an escape is not read as a unit', () => {
    assert.equal(
      reduceCalc('calc(var(--x, calc(1px)\\62) + 1px)', unwrap),
      'calc(1px + var(--x, 1px \\62))'
    );
  });

  test('a number before a percent sign is not read as a percentage', () => {
    assert.equal(
      reduceCalc('calc(var(--x, calc(1)%) + 1px)', unwrap),
      'calc(1px + var(--x, 1 %))'
    );
  });

  test('a dimension before an identifier is not read as a longer unit', () => {
    assert.equal(reduceCalc('foo(calc(1px + 1px)b)', unwrap), 'foo(2px b)');
  });

  test('a zero before an identifier is not read as a dimension', () => {
    assert.equal(reduceCalc('foo(calc(-0)x)', unwrap), 'foo(0 x)');
  });

  test('a replacement after an identifier keeps its own spacing', () => {
    assert.equal(reduceCalc('foo(a calc(1px + 1px))', unwrap), 'foo(a 2px)');
  });
});

describe('reduceTokens: separators at the replacement boundary', () => {
  test('a space follows the replacement when the next token would fuse', () => {
    const tokens = tokenize({ css: 'foo(calc(1px + 1px)b)' });
    const [replacement] = reduceTokens(tokens, unwrap);
    assert.deepEqual(
      replacement.tokens.map((token) => token[1]),
      ['2px', ' ']
    );
  });

  test('a space precedes the replacement when the previous token would fuse', () => {
    // A caller can join tokens that were never adjacent in the source text.
    const tokens = [
      ...tokenize({ css: 'a' }).slice(0, 1),
      ...tokenize({ css: 'calc(1px + 1px)' }),
    ];
    const [replacement] = reduceTokens(tokens, unwrap);
    assert.deepEqual(
      replacement.tokens.map((token) => token[1]),
      [' ', '2px']
    );
  });

  test('no space is added when the neighbours cannot fuse', () => {
    const tokens = tokenize({ css: 'foo(calc(1px + 1px), a)' });
    const [replacement] = reduceTokens(tokens, unwrap);
    assert.deepEqual(
      replacement.tokens.map((token) => token[1]),
      ['2px']
    );
  });
});
