import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc from '../../src/reduce.js';

const unwrap = { unwrapSingleValue: true };

describe('math function roots that cannot fold', () => {
  for (const input of [
    'clamp(1rem, 2.5vw, 2rem)',
    'min(100vw - 2rem, 60ch)',
    'max(1rem, 5%)',
    'round(1vw, 1px)',
  ]) {
    test(`${input} is not wrapped in calc()`, () => {
      assert.equal(reduceCalc(input), input);
      assert.equal(reduceCalc(input, unwrap), input);
    });
  }

  test('an explicit calc() wrapper is kept', () => {
    assert.equal(
      reduceCalc('calc(clamp(1rem, 2.5vw, 2rem))'),
      'calc(clamp(1rem, 2.5vw, 2rem))'
    );
  });

  test('a function that folds to a scalar still gets calc()', () => {
    assert.equal(reduceCalc('abs(1vw)'), 'calc(1vw)');
  });
});

describe('unwrapSingleValue and opaque values', () => {
  for (const input of ['calc(var(--a))', 'calc(env(x))', 'calc(attr(x px))']) {
    test(`${input} keeps calc()`, () => {
      assert.equal(reduceCalc(input, unwrap), input);
    });
  }
});

describe('division by zero', () => {
  test('is not distributed over a mixed-unit sum', () => {
    assert.equal(
      reduceCalc('calc((2em - 2px) / 0)'),
      'calc(infinity * (2em - 2px))'
    );
  });

  test('a non-finite factor keeps an opaque sum grouped', () => {
    assert.equal(
      reduceCalc('calc((1px + var(--a)) * (1 / 0))'),
      'calc(infinity * (1px + var(--a)))'
    );
  });

  test('a literal negative zero divisor keeps its sign', () => {
    assert.equal(reduceCalc('calc(1 / -0)'), 'calc(-infinity)');
    assert.equal(reduceCalc('calc(1 / 0)'), 'calc(infinity)');
    assert.equal(reduceCalc('calc(-1 / -0)'), 'calc(infinity)');
    assert.equal(reduceCalc('calc(1px / -0)'), 'calc(-infinity * 1px)');
  });
});

describe('unwrapped result after a plus sign', () => {
  test('does not fuse into a signed number', () => {
    assert.equal(reduceCalc('a+calc(25% + 25%)', unwrap), 'a+ 50%');
    assert.equal(reduceCalc('a+calc(1 / 2)', unwrap), 'a+ .5');
  });
});
