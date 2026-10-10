// Standalone reduceCalc tests. Mirrors test/unit/plugin.test.js for cases
// that operate on a CSS value string rather than PostCSS node walking.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc from 'postcss-calc/reduce';

describe('reduceCalc: avoids negative zero serialization in sums and grouped sums', () => {
  test('sub-precision negative number term serializes as 0 in unresolved sum', () => {
    assert.equal(reduceCalc('calc(var(--x) - 1e-20)'), 'calc(0 + var(--x))');
  });

  test('sub-precision negative dimension term serializes as 0<unit> in unresolved sum', () => {
    assert.equal(
      reduceCalc('calc(var(--x) - 1e-20px)'),
      'calc(0px + var(--x))'
    );
  });

  test('sub-precision negative dimension term preserves unit alongside resolvable term', () => {
    assert.equal(reduceCalc('calc(1em - 1e-20px)'), 'calc(1em + 0px)');
  });

  test('leading sub-precision negative number term serializes as 0', () => {
    assert.equal(reduceCalc('calc((-1e-20 + var(--x)))'), 'calc(0 + var(--x))');
  });

  test('negated grouped sum with leading sub-precision negative term serializes with positive sign', () => {
    assert.equal(
      reduceCalc('calc(-1 * (-1e-20 + var(--x)))'),
      'calc(-1 * (0 + var(--x)))'
    );
  });

  test('negated grouped sum with non-leading sub-precision negative term serializes with positive sign', () => {
    assert.equal(
      reduceCalc('calc((-10px + var(--x) - 1e-20em))'),
      'calc(-10px + 0em + var(--x))'
    );
  });

  test('negated grouped sum with non-leading sub-precision positive term serializes with positive sign', () => {
    assert.equal(
      reduceCalc('calc((-10px + var(--x) + 1e-20em))'),
      'calc(-10px + 0em + var(--x))'
    );
  });

  test('precision: false retains sub-precision negative number term', () => {
    assert.equal(
      reduceCalc('calc(var(--x) - 1e-20)', { precision: false }),
      'calc(-1e-20 + var(--x))'
    );
  });

  test('precision: false retains grouped negative sum inversion', () => {
    assert.equal(
      reduceCalc('calc((-1e-20 + var(--x)))', { precision: false }),
      'calc(-1e-20 + var(--x))'
    );
  });

  test('threshold survivor above noise floor retains negative sign', () => {
    assert.equal(
      reduceCalc('calc(var(--x) - 1e-10)'),
      'calc(-1e-10 + var(--x))'
    );
  });

  test('sufficient precision retains tiny negative term', () => {
    assert.equal(
      reduceCalc('calc(var(--x) - 1e-20)', { precision: 20 }),
      'calc(-1e-20 + var(--x))'
    );
  });

  test('precision: 0 preserves non-zero value above noise floor', () => {
    assert.equal(
      reduceCalc('calc(var(--x) - 0.4)', { precision: 0 }),
      'calc(-.4 + var(--x))'
    );
  });

  test('nested math-function call argument avoids negative zero serialization', () => {
    assert.equal(
      reduceCalc('min(-1e-20 + var(--x), 1)'),
      'min(0 + var(--x), 1)'
    );
  });

  test('arithmetic signed zero is preserved with default precision', () => {
    assert.equal(
      reduceCalc('calc(0 / -1 * var(--x))'),
      'calc(-1 * 0 * var(--x))'
    );
  });

  test('arithmetic signed zero dimension is preserved under subtraction', () => {
    assert.equal(reduceCalc('calc(1em - 1px * 0)'), 'calc(1em - 0px)');
  });

  test('grouped sum with a leading negative term keeps its signs and a positive zero term', () => {
    assert.equal(
      reduceCalc('calc((-1em + var(--x) + 0px))'),
      'calc(-1em + 0px + var(--x))'
    );
  });

  test('grouped sum with a leading negative term keeps its signs and a negative zero term', () => {
    assert.equal(
      reduceCalc('calc((-1em + var(--x) - 0px))'),
      'calc(-1em - 0px + var(--x))'
    );
  });

  test('negative zero beside a contextual percentage serializes as subtraction', () => {
    assert.equal(reduceCalc('calc(100% - 0px)'), 'calc(100% - 0px)');
    assert.equal(reduceCalc('calc(100% - 0)'), 'calc(100% - 0)');
  });

  test('leading negative zero term moves behind the next term', () => {
    assert.equal(reduceCalc('calc(0 / -1 + var(--x))'), 'calc(var(--x) - 0)');
    assert.equal(reduceCalc('calc(0px / -1 + 1%)'), 'calc(1% - 0px)');
  });

  test('all-negative-zero sums keep a stable term order', () => {
    for (const input of [
      'calc(-1em * 0 - 1px * 0)',
      'calc(1 / sign(calc(-1em * 0 - 1px * 0)))',
    ]) {
      const once = reduceCalc(input);
      assert.equal(reduceCalc(once), once);
    }
    assert.equal(
      reduceCalc('calc(-1em * 0 - 1px * 0)'),
      'calc(-1 * 0em - 0px)'
    );
  });

  test('negative zero before a non-zero term moves behind it', () => {
    assert.equal(reduceCalc('calc(-1em * 0 + 1px)'), 'calc(1px - 0em)');
  });

  test('negative zero type anchor still invalidates an incompatible sum', () => {
    assert.equal(reduceCalc('calc(1deg - 0px)'), 'calc(1deg - 0px)');
  });

  test('non-leading negative zero factor keeps its calc() wrapper', () => {
    assert.equal(
      reduceCalc('calc(var(--x) * (0 / -1))'),
      'calc(var(--x) * calc(-1 * 0))'
    );
  });

  test('negative zero opening a product in a non-leading sum term keeps its sign', () => {
    assert.equal(
      reduceCalc('calc(1px - (0 / -1) * var(--x))'),
      'calc(1px - -1 * 0 * var(--x))'
    );
  });
});
