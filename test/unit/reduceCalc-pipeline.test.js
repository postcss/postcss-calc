// Standalone reduceCalc tests for unwrapping, grouping, and idempotence.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc from 'postcss-calc/reduce';
import {
  hasPotentialMathFunction,
  QUICK_MATH_TEST,
} from '../../src/lib/functions.js';
import { createReduceCalcTestHarness } from '../helpers/reduceCalc.js';

const { reduceWithWarnings, assertIdempotent } =
  createReduceCalcTestHarness(reduceCalc);

describe('reduceCalc: basic pipeline', () => {
  test('reduceCalc: unwrapSingleNegativeNumber aliases unwrapSingleValue', () => {
    assert.equal(
      reduceCalc('a:nth-child(calc(1 - 2))', {
        unwrapSingleNegativeNumber: true,
      }),
      'a:nth-child(-1)'
    );
    assert.equal(
      reduceCalc('calc(1 - 2)', { unwrapSingleNegativeNumber: true }),
      '-1'
    );
    assert.equal(
      reduceCalc('calc(1 / 2)', { unwrapSingleNegativeNumber: true }),
      '.5'
    );
    assert.equal(
      reduceCalc('calc(-1 / 2)', { unwrapSingleNegativeNumber: true }),
      '-.5'
    );
  });

  test('reduceCalc: unwrapSingleValue unwraps negative and fractional scalars', () => {
    assert.equal(reduceCalc('calc(1 - 2)', { unwrapSingleValue: true }), '-1');
    assert.equal(reduceCalc('calc(1 / 2)', { unwrapSingleValue: true }), '.5');
  });

  test('reduceCalc: multiple calcs in one value', () => {
    assert.equal(
      reduceCalc('calc(1px + 1px) calc(2px + 2px)'),
      'calc(2px) calc(4px)'
    );
  });

  test('reduceCalc: one value preserves bytes around several token-slice calculations', () => {
    assert.equal(
      reduceCalc(
        '\\66 oo calc(/*a*/-2px + +5px)  /\\*keep*\\/ MIN(4px,2px)\\9'
      ),
      '\\66 oo calc(3px)  /\\*keep*\\/ calc(2px)\\9'
    );
  });

  test('reduceCalc: non-math functions are preserved quickly without change', () => {
    assert.equal(reduceCalc('rgb(255, 0, 0)'), 'rgb(255, 0, 0)');
    assert.equal(reduceCalc('translate(10px, 20px)'), 'translate(10px, 20px)');
    assert.equal(reduceCalc('var(--my-color)'), 'var(--my-color)');
  });

  test('reduceCalc: hasPotentialMathFunction detects all supported math functions and escapes', () => {
    const supported = [
      'calc',
      '-webkit-calc',
      '-moz-calc',
      'min',
      'max',
      'clamp',
      'abs',
      'sign',
      'mod',
      'rem',
      'round',
      'sin',
      'cos',
      'tan',
      'asin',
      'acos',
      'atan',
      'atan2',
      'pow',
      'sqrt',
      'hypot',
      'log',
      'exp',
    ];
    for (const fn of supported) {
      assert.equal(
        hasPotentialMathFunction(`${fn}(10px)`),
        true,
        `Expected ${fn}() to be detected`
      );
      assert.equal(
        hasPotentialMathFunction(`${fn.toUpperCase()}(10PX)`),
        true,
        `Expected ${fn.toUpperCase()}() to be detected`
      );
      assert.equal(
        QUICK_MATH_TEST.test(`${fn}(10px)`),
        true,
        `Expected QUICK_MATH_TEST to match ${fn}()`
      );
    }

    // Escapes bypass regex check
    assert.equal(hasPotentialMathFunction('\\63 alc(10px)'), true);
    assert.equal(hasPotentialMathFunction('foo\\(bar'), true);

    // Negative cases
    assert.equal(hasPotentialMathFunction('10px'), false);
    assert.equal(hasPotentialMathFunction('red'), false);
    assert.equal(hasPotentialMathFunction('rgb(255, 0, 0)'), false);
    assert.equal(hasPotentialMathFunction('var(--my-var)'), false);
    assert.equal(hasPotentialMathFunction('translate(10px, 20px)'), false);
  });

  test('reduceCalc: nested calculations inside non-math functions are reduced', () => {
    assert.equal(
      reduceCalc('translate(calc(10px + 20px), calc(5px * 2))'),
      'translate(calc(30px), calc(10px))'
    );
  });

  test('reduceCalc: transformations are idempotent', () => {
    const opts = { warnWhenCannotResolve: true };
    assertIdempotent('calc(1px + 2px) calc(2px + 3px)', opts);
    const unresolved = 'calc(100% + var(--x))';
    const first = reduceWithWarnings(unresolved, opts);
    const second = reduceWithWarnings(first.output, opts);
    assert.equal(first.output, unresolved);
    assert.equal(second.output, first.output);
    assert.deepEqual(second.warnings, first.warnings);
  });

  test('reduceCalc: removes leading zero from resolved decimals', () => {
    assert.equal(reduceCalc('calc(1px / 4)'), 'calc(.25px)');
    assert.equal(reduceCalc('calc(1 / 2000000)'), 'calc(5e-7)');
  });

  test('reduceCalc: fractional unitless math results retain calc()', () => {
    assert.equal(reduceCalc('calc(1 / 2)'), 'calc(.5)');
    assert.equal(reduceCalc('sqrt(2)'), 'calc(1.41421)');
    assert.equal(reduceCalc('calc(2 / 1)'), 'calc(2)');
  });

  test('reduceCalc: preserves the unparsable unary minus form byte-for-byte', () => {
    // `-(...)` has no production in the <calc-value> grammar; browsers drop
    // the declaration, so the reducer must not rewrite it into valid CSS.
    assert.equal(
      reduceCalc('calc(-(var(--a) + var(--b)))'),
      'calc(-(var(--a) + var(--b)))'
    );
    assert.equal(
      reduceCalc('calc(-(10px + var(--a)))'),
      'calc(-(10px + var(--a)))'
    );
  });

  test('reduceCalc: preserves the unparsable unary plus form byte-for-byte', () => {
    // `+(...)` has no production in the <calc-value> grammar; browsers drop
    // the declaration, so the reducer must not rewrite it into valid CSS.
    assert.equal(reduceCalc('calc(+(10px + 20px))'), 'calc(+(10px + 20px))');
    assert.equal(reduceCalc('calc(+var(--x))'), 'calc(+var(--x))');
    assert.equal(
      reduceCalc('calc(+(var(--a) + var(--b)))'),
      'calc(+(var(--a) + var(--b)))'
    );
  });

  test('reduceCalc: unary plus on a signed number token simplifies to the bare value', () => {
    // A leading `+` before a <number>/<dimension> token is a valid no-op, so
    // this form is parsed and reduced rather than preserved verbatim.
    assert.equal(reduceCalc('calc(+10px)'), 'calc(10px)');
  });

  test('reduceCalc: preserves grouping through explicit -1 multiplication', () => {
    assert.equal(
      reduceCalc('calc((var(--a) + var(--b)) * -1)'),
      'calc(-1 * (var(--a) + var(--b)))'
    );
  });

  test('reduceCalc: preserves grouping for opaque subtraction', () => {
    assert.equal(
      reduceCalc('calc(5px - (var(--var-1) + var(--var-2)))'),
      'calc(5px - (var(--var-1) + var(--var-2)))'
    );
    assert.equal(
      reduceCalc('calc(var(--a) - (var(--b) + var(--c)))'),
      'calc(var(--a) - (var(--b) + var(--c)))'
    );
    assert.equal(
      reduceCalc('calc(var(--a) - (var(--b) - var(--c)))'),
      'calc(var(--a) - (var(--b) - var(--c)))'
    );
    assert.equal(
      reduceCalc('calc(5px - (10px + var(--a)))'),
      'calc(5px - (10px + var(--a)))'
    );
  });

  test('reduceCalc: preserves nested opaque grouping and simplifies var fallbacks', () => {
    assert.equal(
      reduceCalc(
        'calc(var(--a) - (var(--b) - (var(--c, calc(1px + 2px)) + var(--d))))'
      ),
      'calc(var(--a) - (var(--b) - (var(--c, calc(3px)) + var(--d))))'
    );
  });

  test('reduceCalc: preserves unresolved calc grouping in opaque fallbacks', () => {
    assert.equal(
      reduceCalc('calc(env(foo, calc(var(--x) + 1px) solid))'),
      'calc(env(foo, calc(1px + var(--x)) solid))'
    );
    assert.equal(
      reduceCalc('calc(2 * env(foo, calc(var(--x) + 1px)))'),
      'calc(2 * env(foo, calc(1px + var(--x))))'
    );
  });

  test('reduceCalc: simplifies supported math anywhere in valid var() fallbacks', () => {
    assert.equal(
      reduceCalc(
        'calc(var(--theme\\-size , foo(calc(1px + 2px), [max(4px, 5px)]), calc(6px + 7px)) + 1px)'
      ),
      'calc(1px + var(--theme\\-size , foo(calc(3px), [calc(5px)]), calc(13px)))'
    );
  });
});
