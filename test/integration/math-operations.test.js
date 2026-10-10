import { describe, test } from 'node:test';
import { testValue } from '../helpers/testValue.js';

describe('Complex calculations', () => {
  test(
    'should handle complex calculations (reduce-css-calc#45) (1)',
    testValue(
      'calc(100% + (2 * 100px) - ((75.37% - 63.5px) - 900px))',
      'calc(24.63% + 1163.5px)'
    )
  );

  test(
    'should handle complex calculations (reduce-css-calc#45) (2)',
    testValue(
      'calc(((((100% + (2 * 30px) + 63.5px) / 0.7537) - (100vw - 60px)) / 2) + 30px)',
      'calc(30px + .5 * (-100vw + 60px + (100% + 123.5px) / .7537))'
    )
  );

  test(
    'should handle advanced arithmetic (1)',
    testValue(
      'calc(((75.37% - 63.5px) - 900px) + (2 * 100px))',
      'calc(75.37% - 763.5px)'
    )
  );

  test(
    'should handle advanced arithmetic (2)',
    testValue(
      'calc((900px - (10% - 63.5px)) + (2 * 100px))',
      'calc(1163.5px - 10%)'
    )
  );

  test(
    'should handle nested calc statements (reduce-css-calc#49)',
    // zero bucket kept for type info.
    testValue(
      'calc(calc(2.25rem + 2px) - 1px * 2)',
      /* '2.25rem' */ 'calc(2.25rem + 0px)'
    )
  );
});

describe('Subtraction from zero', () => {
  test(
    'preserves an invalid subtraction of a length from a number',
    testValue('calc( 0 - 10px)', 'calc( 0 - 10px)')
  );

  test(
    'preserves an invalid subtraction of a mixed length expression from a number',
    testValue('calc( 0 - calc(1px + 1em) )', 'calc( 0 - calc(1px + 1em) )')
  );

  test(
    'preserves an invalid subtraction of a divided length from a number',
    testValue(
      'calc( 0 - (100vw - 10px) / 2 )',
      'calc( 0 - (100vw - 10px) / 2 )'
    )
  );

  test(
    'should reduce substracted expression from zero (2)',
    testValue('calc( 0px - (100vw - 10px))', 'calc(10px - 100vw)')
  );

  test(
    'should reduce substracted expression from zero (3)',
    testValue('calc( 0px - (100vw - 10px) * 2 )', 'calc(20px - 200vw)')
  );

  test(
    'should reduce substracted expression from zero (4)',
    testValue('calc( 0px - (100vw + 10px))', 'calc(-10px - 100vw)')
  );

  test(
    'should reduce consecutive substractions (#24) (1)',
    testValue('calc(100% - 120px - 60px)', 'calc(100% - 180px)')
  );

  test(
    'should reduce consecutive substractions (#24) (2)',
    testValue('calc(100% - 10px - 20px)', 'calc(100% - 30px)')
  );

  test(
    'should reduce substracted expression from zero (css-variable)',
    // zero bucket kept; the group around the substitution stays.
    testValue(
      'calc( 0px - (var(--foo, 4px) / 2))',
      'calc(0px - (var(--foo, 4px) / 2))'
    )
  );

  test(
    'should reduce nested expression',
    // zero bucket kept for type info.
    testValue('calc( (1em - calc( 10px + 1em)) / 2)', 'calc(0em - 5px)')
  );
});

describe('Discard zero', () => {
  test(
    'should discard zero values (#2) (1)',
    testValue('calc(100vw / 2 - 6px + 0px)', 'calc(50vw - 6px)')
  );

  test(
    'should discard zero values (#2) (2)',
    testValue('calc(500px - 0px)', 'calc(500px)')
  );
});

describe('Division precedence', () => {
  test(
    'should preserve division precedence',
    // spec-style spaces around `/`; parens around var() are kept.
    testValue(
      'calc(100%/(var(--aspect-ratio)))',
      'calc(100% / (var(--aspect-ratio)))'
    )
  );

  test(
    'should preserve division precedence (2)',
    // `/16` is kept as written; parens around substitutions are kept.
    testValue(
      `calc(
        (var(--fluid-screen) - ((var(--fluid-min-width) / 16) * 1rem)) /
        ((var(--fluid-max-width) / 16) - (var(--fluid-min-width) / 16))
    )`,
      'calc((var(--fluid-screen) - (var(--fluid-min-width) / 16) * 1rem) / ((var(--fluid-max-width) / 16) - (var(--fluid-min-width) / 16)))'
    )
  );

  test(
    'should preserve division precedence (3)',
    // `1/(10/x)` is not folded: x may expand to arbitrary tokens.
    testValue(
      'calc(1/(10/var(--dot-size)))',
      'calc(1 / (10 / var(--dot-size)))'
    )
  );

  test(
    'should correctly preserve parentheses',
    // reciprocal of inner `/16` folds into the coefficient: `16 / (...)`.
    testValue(
      'calc(1/((var(--a) - var(--b))/16))',
      'calc(16 / (var(--a) - var(--b)))'
    )
  );
});

describe('Exponent', () => {
  test(
    'exponent composed',
    testValue('calc(1.1e+1px + 1.1e+1px)', 'calc(22px)')
  );

  test(
    'exponent composed (#1)',
    testValue('calc(10e+1px + 10e+1px)', 'calc(200px)')
  );

  test(
    'exponent composed (#2)',
    testValue('calc(1.1e+10px + 1.1e+10px)', 'calc(22000000000px)')
  );

  test('exponent composed (#3)', testValue('calc(9e+1 * 1px)', 'calc(90px)'));

  test('exponent composed (#4)', testValue('calc(9e+1% + 10%)', 'calc(100%)'));

  test(
    'exponent composed (uppercase)',
    testValue('calc(1.1E+1px + 1.1E+1px)', 'calc(22px)')
  );
});

describe('Plus', () => {
  test('plus sign', testValue('calc(+100px + +100px)', 'calc(200px)'));

  test('plus sign (#1)', testValue('calc(+100px - +100px)', 'calc(0px)'));

  test('plus sign (#2)', testValue('calc(200px * +1)', 'calc(200px)'));

  test('plus sign (#3)', testValue('calc(200px / +1)', 'calc(200px)'));
});

describe('Minus', () => {
  test('minus sign', testValue('calc(-100px + -100px)', 'calc(-200px)'));

  test('minus sign (#2)', testValue('calc(-100px - -100px)', 'calc(0px)'));

  test('minus sign (#3)', testValue('calc(200px * -1)', 'calc(-200px)'));

  test('minus sign (#4)', testValue('calc(200px / -1)', 'calc(-200px)'));
});
