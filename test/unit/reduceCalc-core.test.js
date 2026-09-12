// Standalone reduceCalc tests. Mirrors test/unit/plugin.test.js for cases
// that operate on a CSS value string rather than PostCSS node walking.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc, {
  hasPotentialMathFunction,
  QUICK_MATH_TEST,
} from 'postcss-calc/reduce';

function reduceWithWarnings(value, opts = {}) {
  const warnings = [];
  const output = reduceCalc(value, {
    ...opts,
    onWarn: (message) => {
      warnings.push(message);
      opts.onWarn?.(message);
    },
  });
  return { output, warnings };
}

function assertIdempotent(value, opts = {}) {
  const first = reduceWithWarnings(value, opts);
  const second = reduceWithWarnings(first.output, opts);

  assert.notEqual(first.output, value);
  assert.equal(second.output, first.output);
  assert.deepEqual(second.warnings, first.warnings);
}

describe('reduceCalc: basic pipeline', () => {
  test('reduceCalc: reduces simple calc in a value', () => {
    assert.equal(reduceCalc('calc(1px + 2px)'), '3px');
  });

  test('reduceCalc: preserves non-calc values', () => {
    assert.equal(reduceCalc('red'), 'red');
  });

  test('reduceCalc: ordinary values remain byte-for-byte unchanged', () => {
    assert.equal(reduceCalc('"calc(1px + 2px)"'), '"calc(1px + 2px)"');
    assert.equal(reduceCalc('url(x)'), 'url(x)');
    assert.equal(reduceCalc('  red\\9 '), '  red\\9 ');
  });

  test('reduceCalc: simple resolved results preserve canonical token text', () => {
    assert.equal(reduceCalc('calc(1px + 2px)'), '3px');
    assert.equal(reduceCalc('calc(10% - 2%)'), '8%');
    assert.equal(reduceCalc('calc(1 / 4)'), 'calc(.25)');
    assert.equal(reduceCalc('calc(-2px + 1px)'), 'calc(-1px)');
    assert.equal(reduceCalc('calc(1PX + 2PX)'), '3px');
    assert.equal(reduceCalc(String.raw`calc(1P\58  + 2px)`), '3px');
  });

  test('reduceCalc: opaque escaped spellings survive simplification', () => {
    assert.equal(
      reduceCalc(String.raw`calc(var(--kendo-spacing-1\.5) + 1px)`),
      String.raw`calc(1px + var(--kendo-spacing-1\.5))`
    );
    assert.equal(
      reduceCalc(String.raw`calc(var(--x\,fallback) + 1px)`),
      String.raw`calc(1px + var(--x\,fallback))`
    );
    assert.equal(
      reduceCalc(String.raw`calc(f\,n(1px) + anchor(--x\ top left))`),
      String.raw`calc(f\,n(1px) + anchor(--x\ top left))`
    );
    assert.equal(reduceCalc(String.raw`calc(1f\6fo * 2)`), String.raw`2f\6fo`);
  });

  test('reduceCalc: negative scalar results retain calc()', () => {
    assert.equal(reduceCalc('calc(5px - 10px)'), 'calc(-5px)');
    assert.equal(reduceCalc('calc(5% - 10%)'), 'calc(-5%)');
  });

  test('reduceCalc: rounded negative floating-point noise does not retain calc()', () => {
    assert.equal(reduceCalc('calc(cos(270deg) * 100px)'), '0px');
    assert.equal(
      reduceCalc('calc(cos(270deg) * 100px)', { precision: false }),
      'calc(-1.8369701987210297e-14px)'
    );
  });

  test('reduceCalc: unwrapSingleNegativeNumber controls negative scalar serialization', () => {
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
      'calc(.5)'
    );
  });

  test('reduceCalc: unwrapSingleNumber unwraps negative and fractional scalars', () => {
    assert.equal(reduceCalc('calc(1 - 2)', { unwrapSingleNumber: true }), '-1');
    assert.equal(reduceCalc('calc(1 / 2)', { unwrapSingleNumber: true }), '.5');
  });

  test('reduceCalc: multiple calcs in one value', () => {
    assert.equal(reduceCalc('calc(1px + 1px) calc(2px + 2px)'), '2px 4px');
  });

  test('reduceCalc: one value preserves bytes around several token-slice calculations', () => {
    assert.equal(
      reduceCalc(
        '\\66 oo calc(/*a*/-2px + +5px)  /\\*keep*\\/ MIN(4px,2px)\\9'
      ),
      '\\66 oo 3px  /\\*keep*\\/ 2px\\9'
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
      'translate(30px, 10px)'
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
    assert.equal(reduceCalc('calc(1px / 4)'), '.25px');
    assert.equal(reduceCalc('calc(1 / 2000000)'), 'calc(5e-7)');
  });

  test('reduceCalc: fractional unitless math results retain calc()', () => {
    assert.equal(reduceCalc('calc(1 / 2)'), 'calc(.5)');
    assert.equal(reduceCalc('sqrt(2)'), 'calc(1.41421)');
    assert.equal(reduceCalc('calc(2 / 1)'), '2');
  });

  test('reduceCalc: preserves grouping through unary negation', () => {
    assert.equal(
      reduceCalc('calc(-(var(--a) + var(--b)))'),
      'calc(-(var(--a) + var(--b)))'
    );
    assert.equal(
      reduceCalc('calc(-(10px + var(--a)))'),
      'calc(-(10px + var(--a)))'
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
      'calc(var(--a) - (var(--b) - (var(--c, 3px) + var(--d))))'
    );
  });

  test('reduceCalc: preserves unresolved calc grouping in opaque fallbacks', () => {
    assert.equal(
      reduceCalc('calc(env(foo, calc(var(--x) + 1px) solid))'),
      'env(foo, calc(1px + var(--x)) solid)'
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
      'calc(1px + var(--theme\\-size , foo(3px, [5px]), 13px))'
    );
  });
});
