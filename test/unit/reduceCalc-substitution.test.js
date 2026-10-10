// Substitution functions (`var()`, `env()`, `attr()`, ...) are replaced by
// tokens, not by a value: with `--a: 1px + 2px`, `var(--a) * 6` means
// `1px + 2px * 6`. Factors must not move or cancel across them, and
// parentheses around them must survive.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc from 'postcss-calc/reduce';

/**
 * Token-substitute `1 + 2` for every substitution function and evaluate the
 * unitless arithmetic.
 * @param {string} value
 * @return {number}
 */
function evaluate(value) {
  const expression = value
    .replaceAll('calc(', '(')
    .replaceAll(/(?:var|env|attr)\([^()]*\)/g, '1 + 2');
  return Function(`"use strict"; return ${expression};`)();
}

const cases = [
  ['var(--a) * 2 * 3', 'calc(var(--a) * 6)'],
  ['2 * 3 * var(--a)', 'calc(6 * var(--a))'],
  ['2 * var(--a) * 3', 'calc(2 * var(--a) * 3)'],
  ['2 * var(--a) / 2', 'calc(2 * var(--a) / 2)'],
  ['2px * var(--a) / 1px', 'calc(2px * var(--a) / 1px)'],
  ['2 * (var(--a))', 'calc(2 * (var(--a)))'],
  ['2 * (var(--a) * 3)', 'calc(2 * (var(--a) * 3))'],
  ['var(--a) * 2 - 1px', 'calc(-1px + var(--a) * 2)'],
  ['var(--a) / 2 * 3', 'calc(var(--a) * 1.5)'],
  ['6 / var(--a)', 'calc(6 / var(--a))'],
  ['2 * var(--a) * 3 * var(--b) * 4', 'calc(2 * var(--a) * 3 * var(--b) * 4)'],
  ['var(--a) * 2 * 3 * var(--b) * 4 * 5', 'calc(var(--a) * 6 * var(--b) * 20)'],
  ['env(--a) * 2 * 3', 'calc(env(--a) * 6)'],
  ['2 * 3 * attr(data-a)', 'calc(6 * attr(data-a))'],
  ['2 * (env(--a))', 'calc(2 * (env(--a)))'],
  ['2 * (attr(data-a) * 3)', 'calc(2 * (attr(data-a) * 3))'],
  ['var(--a) / var(--a)', 'calc(var(--a) / var(--a))'],
  ['var(--a) * 2 / var(--a)', 'calc(var(--a) * 2 / var(--a))'],
  ['2 * 3 * sin(var(--a)) * 4', 'calc(24 * sin(var(--a)))'],
  ['1px + --fn(1) * 3 * 2', 'calc(1px + --fn(1) * 6)'],
  ['2 * --fn(1) * 3', 'calc(2 * --fn(1) * 3)'],
  ['var(--x, calc(var(--a) * 2 * 3))', 'calc(var(--x, calc(var(--a) * 6)))'],
  ['max((var(--a)), 1px)', 'calc(max(var(--a), 1px))'],
  ['2 * VAR(--a) * 3', 'calc(2 * VAR(--a) * 3)'],
  ['1px - (2 * var(--a))', 'calc(1px - (2 * var(--a)))'],
  ['var(--a) / calc(var(--a))', 'calc(var(--a) / (var(--a)))'],
  ['1px - calc(var(--a))', 'calc(1px - (var(--a)))'],
  ['(var(--b) - 7 - 2)', 'calc(-9 + var(--b))'],
  // Unrecognised functions are conservative barriers too.
  ['2 * anchor-size(width) * .5', 'calc(2 * anchor-size(width) * .5)'],
  ['2 * 3 * foo(1)', 'calc(6 * foo(1))'],
  ['inherit(--a) * 2 * 3', 'calc(inherit(--a) * 6)'],
  [
    '1px + if(style(--a): 1px; else: 2px) * 2 * 3',
    'calc(1px + if(style(--a): 1px; else: 2px) * 6)',
  ],
  [
    '2px * -webkit-calc(var(--a) + 1px)',
    'calc(2px * -webkit-calc(var(--a) + 1px))',
  ],
  ['1px - -webkit-calc(var(--a) - 1px)', 'calc(1px - (-1px + var(--a)))'],
  ['1px - calc(-1 * var(--a))', 'calc(1px - (-1 * var(--a)))'],
];

describe('reduceCalc: substitution functions are positional barriers', () => {
  for (const [input, expected] of cases) {
    test(`calc(${input}) → ${expected}`, () => {
      assert.equal(reduceCalc(`calc(${input})`), expected);
    });
  }

  test('negation stays on the first term of a substituted sum', () => {
    assert.equal(reduceCalc('calc(-1 * var(--a))'), 'calc(-1 * var(--a))');
    assert.equal(reduceCalc('calc(var(--a) * -1)'), 'calc(var(--a) * -1)');
  });

  test('reduced results equal the token-substituted source', () => {
    const inputs = [
      'var(--a) * 2 * 3',
      '2 * 3 * var(--a)',
      '2 * var(--a) / 2',
      '2 * (var(--a))',
      '2 * (var(--a) * 3)',
      'var(--a) * 2 - 1',
      'var(--a) / 2 * 3',
      '6 / var(--a)',
      '2 * var(--a) * 3 * var(--a) * 4',
      'env(x) * 2 * 3',
      '2 * (attr(x) * 3)',
      'var(--a) / var(--a)',
      '1 - (2 * var(--a))',
      '(var(--a) - 7 - 2)',
      'var(--a) / calc(var(--a))',
    ];
    for (const input of inputs) {
      assert.equal(
        evaluate(reduceCalc(`calc(${input})`)),
        evaluate(`calc(${input})`),
        input
      );
    }
  });
});
