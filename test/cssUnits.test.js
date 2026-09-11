import { test, describe } from 'node:test';
import { testValue } from './helpers/testValue.test.js';

describe('Preserve incompatible units', () => {
  test(
    'should preserve calc with incompatible units',
    testValue('calc(100% + 1px)', 'calc(100% + 1px)')
  );

  test(
    'should preserve calc with cqw units',
    testValue('calc(12.72727px + 8.523cqw)', 'calc(12.72727px + 8.523cqw)')
  );
});

describe('cq* units', () => {
  test(
    'should add numbers with cqw units',
    testValue('calc(1cqw + 8cqw)', '9cqw')
  );

  test(
    'should add numbers with cqh units',
    testValue('calc(1cqh + 3cqh)', '4cqh')
  );

  test(
    'should add numbers with cqi units',
    testValue('calc(1cqi + 3cqi)', '4cqi')
  );

  test(
    'should add numbers with cqb units',
    testValue('calc(1cqb + 3cqb)', '4cqb')
  );

  test(
    'should add numbers with cqmin units',
    testValue('calc(1cqmin + 3cqmin)', '4cqmin')
  );

  test(
    'should add numbers with cqmax units',
    testValue('calc(1cqmax + 3cqmax)', '4cqmax')
  );

  test(
    'should add expressions with svh units',
    testValue(
      'calc(98% - 1.5rem - (85svh/8.2 + 1.9rem + 1.65svh))',
      'calc(98% - 3.4rem - 12.01585svh)'
    )
  );
});

test(
  'should not combine different viewport units',
  testValue('calc(100svmax - 44.5svh)', 'calc(100svmax - 44.5svh)')
);

describe('Add', () => {
  test('should add numbers with lh units', testValue('calc(1lh + 4lh)', '5lh'));

  test(
    'should add numbers with rlh units',
    testValue('calc(1rlh + 4rlh)', '5rlh')
  );
});

describe('Combine units', () => {
  test(
    'should not combine different lh units',
    testValue('calc(1lh + 4rlh)', 'calc(1lh + 4rlh)')
  );

  test(
    'should not combine different lh units',
    testValue('calc(1lh + 20px)', 'calc(1lh + 20px)')
  );
});

describe('Convert units', () => {
  test('convert units', testValue('calc(1cm + 1px)', '1.02646cm'));

  test('convert units (#1)', testValue('calc(1px + 1cm)', '38.79528px'));

  // unit case lowercased.
  test('convert units (#2)', testValue('calc(10Q + 10Q)', /* '20Q' */ '20q'));

  test('convert units (#3)', testValue('calc(100.9q + 10px)', '111.48333q'));

  test('convert units (#4)', testValue('calc(10px + 100.9q)', '105.33858px'));

  test('convert units (#5)', testValue('calc(10cm + 1px)', '10.02646cm'));

  test('convert units (#6)', testValue('calc(10mm + 1px)', '10.26458mm'));

  test('convert units (#7)', testValue('calc(10px + 1q)', '10.94488px'));

  test('convert units (#8)', testValue('calc(10cm + 1q)', '10.025cm'));

  test('convert units (#9)', testValue('calc(10mm + 1q)', '10.25mm'));

  test('convert units (#10)', testValue('calc(10in + 1q)', '10.00984in'));

  test('convert units (#11)', testValue('calc(10pt + 1q)', '10.70866pt'));

  test('convert units (#12)', testValue('calc(10pc + 1q)', '10.05906pc'));

  test('convert units (#13)', testValue('calc(1q + 10px)', '11.58333q'));

  test('convert units (#14)', testValue('calc(1q + 10cm)', '401q'));

  test('convert units (#15)', testValue('calc(1q + 10mm)', '41q'));

  test('convert units (#16)', testValue('calc(1q + 10in)', '1017q'));

  test('convert units (#17)', testValue('calc(1q + 10pt)', '15.11111q'));

  test('convert units (#18)', testValue('calc(1q + 10pc)', '170.33333q'));
});

describe('Unknown units', () => {
  test(
    'unknown units',
    // same-unit arithmetic is purely numeric (§10.9; matches csstools).
    testValue(
      'calc(1unknown + 2unknown)',
      /* 'calc(1unknown + 2unknown)' */ '3unknown'
    )
  );

  test(
    'unknown units with known',
    testValue('calc(1unknown + 2px)', 'calc(1unknown + 2px)')
  );

  test(
    'unknown units with known (#1)',
    testValue('calc(1px + 2unknown)', 'calc(1px + 2unknown)')
  );
});

describe('Mixed units', () => {
  test(
    'should correctly reduce calc with mixed units (cssnano#211)',
    // zero bucket kept for type info.
    testValue('calc(99.99% * 1/1 - 0rem)', /* '99.99%' */ 'calc(99.99% + 0rem)')
  );

  test(
    'should reduce mixed units of time (postcss-calc#33)',
    testValue('calc(1s - 50ms)', '.95s')
  );

  test(
    'should apply optimization (cssnano#320)',
    testValue('calc(50% + (5em + 5%))', 'calc(55% + 5em)')
  );
});

test(
  'should not perform addition on unitless values (reduce-css-calc#3)',
  // canonical order: number before dim.
  testValue('calc(1px + 1)', /* 'calc(1px + 1)' */ 'calc(1 + 1px)')
);
