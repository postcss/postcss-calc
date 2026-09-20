// Standalone reduceCalc tests. Mirrors test/unit/plugin.test.js for cases
// that operate on a CSS value string rather than PostCSS node walking.
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
  test('reduceCalc: reduces simple calc in a value', () => {
    assert.equal(reduceCalc('calc(1px + 2px)'), 'calc(3px)');
  });

  test('reduceCalc: resolves named functions containing clamp none bounds', () => {
    const warnings = [];
    assert.equal(
      reduceCalc('sqrt(clamp(none, 1, 2))', {
        warnWhenCannotResolve: true,
        onWarn: (warning) => warnings.push(warning),
      }),
      'calc(1)'
    );
    assert.equal(reduceCalc('pow(clamp(none, 2, 3), 2)'), 'calc(4)');
    assert.deepEqual(warnings, []);
  });

  test('reduceCalc: preserves non-calc values', () => {
    assert.equal(reduceCalc('red'), 'red');
  });

  test('reduceCalc: does not partially rewrite a nested calc in an unclosed calc', () => {
    const value = 'calc(1px + calc(1px + 1px)';
    assert.equal(reduceCalc(value), value);
  });

  test('reduceCalc: ordinary values remain byte-for-byte unchanged', () => {
    assert.equal(reduceCalc('"calc(1px + 2px)"'), '"calc(1px + 2px)"');
    assert.equal(reduceCalc('url(x)'), 'url(x)');
    assert.equal(reduceCalc('  red\\9 '), '  red\\9 ');
  });

  test('reduceCalc: simple resolved results preserve canonical token text', () => {
    assert.equal(reduceCalc('calc(1px + 2px)'), 'calc(3px)');
    assert.equal(reduceCalc('calc(10% - 2%)'), 'calc(8%)');
    assert.equal(reduceCalc('calc(1 / 4)'), 'calc(.25)');
    assert.equal(reduceCalc('calc(-2px + 1px)'), 'calc(-1px)');
    assert.equal(reduceCalc('calc(1PX + 2PX)'), 'calc(3px)');
    assert.equal(reduceCalc(String.raw`calc(1P\58  + 2px)`), 'calc(3px)');
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
    assert.equal(
      reduceCalc(String.raw`calc(1f\6fo * 2)`),
      String.raw`calc(2f\6fo)`
    );
  });

  test('reduceCalc: negative scalar results retain calc()', () => {
    assert.equal(reduceCalc('calc(5px - 10px)'), 'calc(-5px)');
    assert.equal(reduceCalc('calc(5% - 10%)'), 'calc(-5%)');
  });

  test('reduceCalc: rounded negative floating-point noise does not retain calc()', () => {
    assert.equal(reduceCalc('calc(cos(270deg) * 100px)'), 'calc(0px)');
    assert.equal(
      reduceCalc('calc(cos(270deg) * 100px)', { precision: false }),
      'calc(-1.8369701987210297e-14px)'
    );
  });

  test('reduceCalc: source signed zero is ordinary zero and remains a type anchor', () => {
    assert.equal(
      reduceCalc('calc(-0 * var(--x))', { precision: false }),
      'calc(0 * var(--x))'
    );
    assert.equal(
      reduceCalc('calc(-0 + var(--x))', { precision: false }),
      'calc(0 + var(--x))'
    );
  });

  test('reduceCalc: literal and folded zero constrain unresolved sums identically', () => {
    assert.equal(reduceCalc('calc(var(--x) + 0)'), 'calc(0 + var(--x))');
    assert.equal(reduceCalc('calc(var(--x) + (0 * 1))'), 'calc(0 + var(--x))');
  });

  test('reduceCalc: zero anchors do not block reductions of sibling terms', () => {
    assert.equal(
      reduceCalc('calc(10 + var(--x) + 20 + (0 * 1))'),
      'calc(30 + var(--x))'
    );
  });

  test('reduceCalc: literal and folded non-finite terms simplify consistently', () => {
    assert.equal(
      reduceCalc('calc(var(--x) + infinity)'),
      'calc(infinity + var(--x))'
    );
    assert.equal(
      reduceCalc('calc(var(--x) + (1 / 0))'),
      'calc(infinity + var(--x))'
    );
    assert.equal(reduceCalc('calc(var(--x) + NaN)'), 'calc(NaN + var(--x))');
    assert.equal(
      reduceCalc('calc(var(--x) + (0 / 0))'),
      'calc(NaN + var(--x))'
    );
  });

  test('reduceCalc: grouped zero anchor survives enclosing subtraction', () => {
    assert.equal(
      reduceCalc('calc(100 - (var(--x) + (0 * 1)))'),
      'calc(100 - (0 + var(--x)))'
    );
  });

  test('reduceCalc: invalid percentage-dimension products are preserved whole', () => {
    const single = 'calc(0% * 0 * 0px + (-1 / -infinity * 0))';
    const multi = 'calc(10px + 20px + 0% * 0 * 0px + (-1 / -infinity * 0))';
    assert.equal(reduceCalc(single), single);
    assert.equal(reduceCalc(multi), multi);
  });

  test('reduceCalc: preserves arithmetic signed zero inside unresolved calculations', () => {
    assert.equal(
      reduceCalc('calc(0 / -1 * var(--x))', { precision: false }),
      'calc(calc(-1 * 0) * var(--x))'
    );
    assert.equal(
      reduceCalc('min(0px / -1, var(--x))', { precision: false }),
      'min(calc(-1 * 0px), var(--x))'
    );
  });

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
      assert.equal(
        reduceCalc('calc((-1e-20 + var(--x)))'),
        'calc(0 + var(--x))'
      );
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
        'calc(-1 * (10px + 0em - var(--x)))'
      );
    });

    test('negated grouped sum with non-leading sub-precision positive term serializes with positive sign', () => {
      assert.equal(
        reduceCalc('calc((-10px + var(--x) + 1e-20em))'),
        'calc(-1 * (10px + 0em - var(--x)))'
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
        'calc(-1 * (1e-20 - var(--x)))'
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
        'calc(calc(-1 * 0) * var(--x))'
      );
    });

    test('arithmetic signed zero dimension is preserved under subtraction', () => {
      assert.equal(
        reduceCalc('calc(1em - 1px * 0)'),
        'calc(1em + calc(-1 * 0px))'
      );
    });

    test('negated grouped sum serializes a negated positive zero term as arithmetic negative zero', () => {
      assert.equal(
        reduceCalc('calc((-1em + var(--x) + 0px))'),
        'calc(-1 * (1em + calc(-1 * 0px) - var(--x)))'
      );
    });

    test('negated grouped sum serializes a negated negative zero term as positive zero', () => {
      assert.equal(
        reduceCalc('calc((-1em + var(--x) - 0px))'),
        'calc(-1 * (1em + 0px - var(--x)))'
      );
    });
  });

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
