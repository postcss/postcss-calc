import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc from 'postcss-calc/reduce';
import { testValue } from '../helpers/testValue.js';

describe('Exact-by-default division', () => {
  const rows = [
    ['calc(100% / 4)', 'calc(25%)'],
    ['calc(100% / 3)', 'calc(100% / 3)'],
    ['calc(100% / 3 * 3)', 'calc(100%)'],
    ['calc(10px / 3 + 2px + 1px)', 'calc(3px + 10px / 3)'],
    ['calc(10px / 4 / 3)', 'calc(5px / 6)'],
    ['calc(var(--n) / 150000)', 'calc(var(--n) / 150000)'],
    ['calc((100% - 10px) / 3)', 'calc((100% - 10px) / 3)'],
    ['calc(1px + 1pt)', 'calc(1.75pt)'],
    ['calc(1cm + 1px)', 'calc(1cm + 1px)'],
    ['max(1in, 100px)', 'calc(100px)'],
    ['calc(1px / 70000)', 'calc(1px / 70000)'],
    ['calc(1px / 96)', 'calc(1px / 96)'],
    ['calc(1px / 150000)', 'calc(1px / 150000)'],
    ['calc(.0123456px)', 'calc(.012346px)'],
    ['calc(1 / 3)', 'calc(1 / 3)'],
    ['calc(10px / 3 * 3)', 'calc(10px)'],
    ['calc(10px / -3)', 'calc(-10px / 3)'],
    ['calc(1px / 1in)', 'calc(1px / 1in)'],
    ['calc(1in / 1px)', 'calc(96)'],
    ['calc(var(--n) / 4)', 'calc(.25 * var(--n))'],
    ['calc(2 * var(--n) / 3)', 'calc(2 * var(--n) / 3)'],
    // Quotients whose parts would be rounded on output are folded instead.
    ['calc(1em * 105 / 64)', 'calc(105em / 64)'],
    ['calc(1rem * 2.828427125 / 2)', 'calc(1.41421rem)'],
    ['calc(cos(220deg) * var(--rad) / 2)', 'calc(-.38302 * var(--rad))'],
    ['calc(100rem * 1.9999999999999993 / 1024.0)', 'calc(25rem / 128)'],
  ];
  for (const [input, expected] of rows) {
    test(`${input} → ${expected}`, testValue(input, expected));
  }

  test('output is idempotent', () => {
    for (const [input] of rows) {
      const once = reduceCalc(input);
      assert.equal(reduceCalc(once), once, input);
    }
  });

  test('precision false folds every division', () => {
    assert.equal(
      reduceCalc('calc(100% / 3)', { precision: false }),
      'calc(33.333333333333336%)'
    );
    assert.equal(
      reduceCalc('calc(1px + 1pt)', { precision: false }),
      'calc(2.333333333333333px)'
    );
  });

  test('a higher precision folds quotients that are exact there', () => {
    assert.equal(
      reduceCalc('calc(1px / 96)', { precision: 10 }),
      'calc(1px / 96)'
    );
    assert.equal(
      reduceCalc('calc(1px / 256)', { precision: 5 }),
      'calc(1px / 256)'
    );
    assert.equal(
      reduceCalc('calc(1px / 256)', { precision: 8 }),
      'calc(.00390625px)'
    );
  });

  test('min, max and clamp keep the chosen argument, with or without precision', () => {
    for (const precision of [5, false]) {
      assert.equal(reduceCalc('max(1in, 100px)', { precision }), 'calc(100px)');
      assert.equal(reduceCalc('min(1in, 100px)', { precision }), 'calc(1in)');
      assert.equal(
        reduceCalc('clamp(1px, 1in, 2in)', { precision }),
        'calc(1in)'
      );
    }
  });

  test('min, max and clamp keep the sign of zero', () => {
    // atan2 observes the sign of its first argument.
    for (const input of [
      'atan2(min(0, calc(-1 * 0)), -1)',
      'atan2(max(calc(-1 * 0), -1), -1)',
      'atan2(clamp(-1, calc(-1 * 0), 1), -1)',
    ]) {
      assert.equal(reduceCalc(input), 'calc(-180deg)', input);
    }
  });

  test('a symbolic division does not warn about being unresolved', () => {
    const warnings = [];
    reduceCalc('calc(10px / 3)', {
      warnWhenCannotResolve: true,
      onWarn: (message) => warnings.push(message),
    });
    assert.deepEqual(warnings, []);
  });
});
