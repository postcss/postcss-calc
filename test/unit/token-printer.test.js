// The token printer's output: each replacement from `reduceTokens` holds the
// tokens of its reduced text, for expressions that exercise every emitter.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenType, tokenize } from '@csstools/css-tokenizer';
import reduceCalc from 'postcss-calc/reduce';
import reduceTokens from 'postcss-calc/reduce-tokens';
import { decodeIdentifier } from '../../src/lib/serialize/sink.js';

// Expressions whose printed output exercises each emitter: signed numbers,
// negative zero, degenerate keywords, opaque groups, wrappers and escapes.
const printerCases = [
  'calc(1px + 2px)',
  'calc(2px - 3px)',
  'calc(-1px + 3px)',
  'calc(1px - 2px - 3px)',
  'calc(1px * -2)',
  'calc(10px / 3)',
  'calc(1.23456px * 1)',
  'calc(1e21px + 1px)',
  'calc(-1 * 0px)',
  'calc(-0px)',
  'calc(1px + -0px)',
  'calc(var(--a) + -0px)',
  'calc(-1 * (var(--a) + 1px))',
  'calc(infinity * 1px)',
  'calc(-infinity * 1px)',
  'calc(-infinity)',
  'calc(NaN + 1px)',
  'calc(-1 * infinity)',
  'min(1px, 2px)',
  'max(-1px, -2px)',
  'clamp(1px, var(--a), 3px)',
  'calc(var(--a) + 2px)',
  'calc(1px + var(--a, calc(2px + 3px)))',
  'calc(1px + 2\\70 x)',
  'CALC(1px + 2px)',
  '-webkit-calc(1px + 2px)',
];
const printerOptions = [{}, { unwrapSingleValue: true }, { precision: false }];

/** Type, raw text and parsed value of each token, without source offsets or EOF. */
function tokenShapes(tokens) {
  return tokens
    .filter((token) => token[0] !== TokenType.EOF)
    .map((token) => [token[0], token[1], token[4]]);
}

describe('printer tokens', () => {
  for (const value of printerCases) {
    for (const options of printerOptions) {
      const label = `${value} ${JSON.stringify(options)}`;
      test(`the replacement tokens of ${label} equal the tokens of its reduced text`, () => {
        const output = reduceCalc(value, options);
        const replacements = reduceTokens(tokenize({ css: value }), options);
        if (output === value) {
          assert.deepEqual(replacements, []);
          return;
        }
        assert.equal(replacements.length, 1);
        assert.deepEqual(
          tokenShapes(replacements[0].tokens),
          tokenShapes(tokenize({ css: output }))
        );
      });
    }
  }
});

/** The `[start, end]` offsets of each token, without EOF. */
const offsets = (tokens) =>
  tokens
    .filter((token) => token[0] !== TokenType.EOF)
    .map((token) => [token[2], token[3]]);

describe('printer token offsets', () => {
  for (const value of [
    'calc(var(--a) + 1px + 1px)',
    'calc(1px + 2px + var(--a, foo bar))',
    'calc(1px + var(--a, calc(2px + 3px)))',
  ]) {
    test(`the offsets of ${value} locate its tokens in the replacement text`, () => {
      const [replacement] = reduceTokens(tokenize({ css: value }));
      const text = replacement.tokens.map((token) => token[1]).join('');
      assert.deepEqual(
        offsets(replacement.tokens),
        offsets(tokenize({ css: text }))
      );
    });
  }

  test('a replacement does not change the tokens it was read from', () => {
    const tokens = tokenize({ css: 'calc(var(--a) + 1px + 1px)' });
    const before = structuredClone(tokens);
    reduceTokens(tokens);
    assert.deepEqual(tokens, before);
  });
});

describe('printer tokens that would fuse', () => {
  // A reduced scalar written next to an adjacent identifier or number must
  // stay a separate token, in the text and in the tokens.
  const fusing = [
    'calc(var(--x, calc(1px + 2px)foo) + 1px)',
    'calc(var(--x, calc(1 + 2)foo) + 1px)',
    'calc(var(--x, a calc(1px + 2px)3) + 1px)',
    'calc(var(--x, 1calc(1px + 2px)) + 1px)',
    'calc(var(--x, calc(1px + 2px)calc(3px + 4px)) + 1px)',
  ];
  for (const value of fusing) {
    test(`${value} keeps its tokens apart`, () => {
      const options = { unwrapSingleValue: true };
      const output = reduceCalc(value, options);
      const [replacement] = reduceTokens(tokenize({ css: value }), options);
      const text = replacement.tokens.map((token) => token[1]).join('');
      assert.equal(text, output);
      assert.deepEqual(
        tokenShapes(replacement.tokens),
        tokenShapes(tokenize({ css: output }))
      );
    });
  }

  test('a reduced dimension followed by an identifier reads as two tokens', () => {
    assert.equal(
      reduceCalc('calc(var(--x, calc(1px + 2px)foo) + 1px)', {
        unwrapSingleValue: true,
      }),
      'calc(1px + var(--x, 3px foo))'
    );
  });

  test('a wrapped result needs no separator', () => {
    assert.equal(
      reduceCalc('calc(var(--x, calc(1px + 2px)foo) + 1px)'),
      'calc(1px + var(--x, calc(3px)foo))'
    );
  });
});

describe('decodeIdentifier: agrees with the tokenizer', () => {
  for (const css of [
    'a\\',
    'c\\61 lc',
    '\\0 x',
    '\\d800 x',
    '\\110000 ',
    'a\\b',
  ]) {
    test(JSON.stringify(css), () => {
      const [token] = tokenize({ css });
      assert.equal(decodeIdentifier(css), token[4].value);
    });
  }
});
