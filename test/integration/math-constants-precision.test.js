import { describe, test } from 'node:test';
import { testValue } from '../helpers/testValue.js';

describe('Math edge cases', () => {
  test(
    'should not throw an exception when attempting to divide by zero',
    // `/0` → `infinity` (§10.13); previously threw.
    testValue('calc(500px/0)', 'calc(infinity * 1px)')
  );

  test(
    'should not throw an exception when attempting to divide by unit (#1)',
    // dim / dim → unitless number; previously threw.
    testValue('calc(500px/2px)', 'calc(250)')
  );
});

describe('Math constants', () => {
  test(
    'should calculate e',
    // fold `e` (§10.7.1).
    testValue('calc(e)', 'calc(2.71828)')
  );

  test(
    'should ignore multiplication with infinity',
    // spec-style spaces around `*`.
    testValue('calc(infinity * 1px)', 'calc(infinity * 1px)')
  );

  test(
    'should ignore addition with infinity',
    testValue('calc(infinity + 1px)', 'calc(infinity + 1px)')
  );

  test(
    'should perform multiplication with pi (§10.7.1)',
    testValue('calc(1px * pi)', 'calc(3.14159px)')
  );

  test(
    'should perform addition with pi (§10.7.1)',
    testValue('calc(43 + pi)', 'calc(46.14159)')
  );
});

describe('Precision', () => {
  test(
    'should handle precision correctly (1)',
    testValue('calc(1/100)', 'calc(.01)')
  );

  test(
    'should handle precision correctly (2)',
    testValue('calc(5/1000000)', 'calc(.000005)')
  );

  test(
    'should handle precision correctly (3)',
    testValue('calc(5/1000000)', 'calc(.000005)', { precision: 6 })
  );

  test(
    'should keep a value smaller than the precision instead of rounding it to zero',
    testValue('calc(1/1000000)', 'calc(.000001)')
  );

  test(
    'should keep a dimension smaller than the precision',
    testValue('calc(1px/1000000)', 'calc(.000001px)')
  );

  test(
    'should keep a negative value smaller than the precision',
    testValue('calc(-1/1000000)', 'calc(-.000001)')
  );

  test(
    'should keep the ratio between two values smaller than the precision',
    testValue('calc(2/1000000)', 'calc(.000002)')
  );

  test(
    'should limit a value smaller than the precision to that many significant digits',
    testValue('calc(.00000033333333 + 0)', 'calc(3.3333e-7)')
  );

  test(
    'should still round float noise down to zero',
    testValue('calc(0.1px + 0.2px - 0.3px)', 'calc(0px)')
  );

  test(
    'should fold exact cancellation with large operands to zero, not a phantom',
    testValue('calc(0.07px * 1e7 - 700000px)', 'calc(0px)')
  );
  test('precision for calc', testValue('calc(100% / 3 * 3)', 'calc(100%)'));

  test(
    'precision for nested calc',
    testValue('calc(calc(100% / 3) * 3)', 'calc(100%)')
  );

  test(
    'accurate midpoint rounding for dimensions',
    testValue('calc(1.005px)', 'calc(1.01px)', { precision: 2 })
  );

  test(
    'accurate midpoint rounding for negative dimensions',
    testValue('calc(-1.005px)', 'calc(-1.01px)', { precision: 2 })
  );

  test(
    'precision false retains lossless float for division',
    testValue('calc(1/3)', 'calc(.3333333333333333)', { precision: false })
  );

  test(
    'division of an opaque term is kept at default precision',
    testValue('calc(var(--x) / 3)', 'calc(var(--x) / 3)')
  );

  test(
    'division of an opaque term is kept at precision false',
    testValue('calc(var(--x) / 3)', 'calc(var(--x) / 3)', {
      precision: false,
    })
  );
});
