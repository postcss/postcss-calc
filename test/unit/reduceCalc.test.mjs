// Standalone reduceCalc tests. Mirrors test/unit/plugin.test.mjs for cases
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

// --- Basic pipeline ------------------------------------------------------
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
    assert.equal(reduceCalc('calc(1 / 4)'), '.25');
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
    assert.equal(reduceCalc('calc(1 / 2000000)'), '5e-7');
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

  test('reduceCalc: preserves arbitrary fallback components and invalid var names', () => {
    assert.equal(
      reduceCalc(
        'calc(var(--x, "calc(1px + 2px)", /* calc */ {x: calc(2px + 3px)}) + 1px)'
      ),
      'calc(1px + var(--x, "calc(1px + 2px)", /* calc */ {x: 5px}))'
    );
    assert.equal(
      reduceCalc('calc(var(--, calc(1px + 2px)) + 1px)'),
      'calc(var(--, calc(1px + 2px)) + 1px)'
    );
  });

  test('reduceCalc: mixed relative and convertible absolute units fold correctly regardless of order', () => {
    assert.equal(reduceCalc('calc(1em + 1px + 1in)'), 'calc(1em + 97px)');
    assert.equal(reduceCalc('calc(1px + 1em + 1in)'), 'calc(97px + 1em)');
  });

  test('reduceCalc: simplify deepest calculation and preserve fallback syntax with alternating nested var fallbacks ', () => {
    const input =
      'calc(var(--step-1, /* comment */ calc(var(--step-2, [extra], calc(var(--step-3, calc(10px + 20px)))))))';
    const expected =
      'var(--step-1, /* comment */ var(--step-2, [extra], var(--step-3, 30px)))';
    assert.equal(reduceCalc(input), expected);

    const inputWithMath =
      'calc(var(--step-1, /* comment */ calc(var(--step-2, [extra], calc(var(--step-3, calc(10px + 20px)))))) + 1px)';
    const expectedWithMath =
      'calc(1px + var(--step-1, /* comment */ var(--step-2, [extra], var(--step-3, 30px))))';
    assert.equal(reduceCalc(inputWithMath), expectedWithMath);
  });

  test('reduceCalc: nested block commas stay inside var fallbacks', () => {
    const input =
      'calc(var(--x, [calc(1px + 2px), {a: calc(3px + 4px), b: calc(5px + 6px)}], calc(7px + 8px)))';
    assert.equal(reduceCalc(input), 'var(--x, [3px, {a: 7px, b: 11px}], 15px)');
  });

  test('reduceCalc: mismatched blocks do not hide nested calculations', () => {
    assert.equal(reduceCalc('[calc(1px + 2px)'), '[3px');
    assert.equal(reduceCalc('{calc(3px + 4px)]'), '{7px]');
  });

  test('reduceCalc: vendor-prefix calcs get the same simplification', () => {
    assert.equal(reduceCalc('-webkit-calc(1px + 2px)'), '3px');
  });

  test('reduceCalc: vendor-prefix wrapper preserved when expression cannot fully resolve', () => {
    assert.equal(
      reduceCalc('-webkit-calc(1px + var(--x))'),
      '-webkit-calc(1px + var(--x))'
    );
    assert.equal(
      reduceCalc('-moz-calc(1px + var(--x))'),
      '-moz-calc(1px + var(--x))'
    );
  });
});

// --- warnWhenCannotResolve -----------------------------------------------
test('reduceCalc: warnWhenCannotResolve surfaces unresolved expressions', () => {
  const { warnings } = reduceWithWarnings('calc(100% + var(--x))', {
    warnWhenCannotResolve: true,
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Could not reduce/);
});

test('reduceCalc: no warning when expression fully resolves', () => {
  const { warnings } = reduceWithWarnings('calc(1px + 2px)', {
    warnWhenCannotResolve: true,
  });
  assert.equal(warnings.length, 0);
});

test('reduceCalc: no warning when a negative expression fully resolves', () => {
  const { output, warnings } = reduceWithWarnings('calc(1px - 2px)', {
    warnWhenCannotResolve: true,
  });
  assert.equal(output, 'calc(-1px)');
  assert.equal(warnings.length, 0);
});

test('reduceCalc: warns for an unresolved supported math call', () => {
  const { warnings } = reduceWithWarnings('calc(abs(var(--x)))', {
    warnWhenCannotResolve: true,
  });
  assert.equal(warnings.length, 1);
});

// --- mediaQueries / selectors (value strings the plugin would pass) ------
describe('reduceCalc: media query params', () => {
  test('reduceCalc: reduces calc in a media-query param string', () => {
    assert.equal(
      reduceCalc('(min-width: calc(100px + 100px))'),
      '(min-width: 200px)'
    );
  });

  test('reduceCalc: media-query param transformations are idempotent', () => {
    assertIdempotent('(min-width: calc(100px + 100px))');
  });
});

// --- onParseError --------------------------------------------------------
describe('reduceCalc: OnParseError', () => {
  test('reduceCalc: default behavior on parse failure leaves the value unchanged', () => {
    assert.equal(reduceCalc('calc(1 /)'), 'calc(1 /)');
  });

  test('reduceCalc: onParseError receives the error and inner calc body', () => {
    const captured = [];
    const output = reduceCalc('calc(1 /)', {
      onParseError: (err, input) =>
        captured.push({ message: err.message, input }),
    });
    assert.equal(output, 'calc(1 /)');
    assert.equal(captured.length, 1);
    assert.match(captured[0].message, /Unexpected token/);
    assert.equal(captured[0].input, '1 /');
  });

  test('reduceCalc: onParseError receives the inner calc body, not the full value', () => {
    const inputs = [];
    reduceCalc('calc(1 /) calc(2 /)', {
      onParseError: (_, input) => inputs.push(input),
    });
    assert.deepEqual(inputs, ['1 /', '2 /']);
  });

  test('reduceCalc: division by zero now folds to infinity (no error)', () => {
    const captured = [];
    const output = reduceCalc('calc(1px / 0)', {
      onParseError: (err) => captured.push(err),
    });
    assert.equal(captured.length, 0);
    assert.equal(output, 'calc(infinity * 1px)');
  });

  test('reduceCalc: division by zero preserves escaped unknown units', () => {
    assert.equal(
      reduceCalc(String.raw`calc(1f\2c oo / 0)`),
      String.raw`calc(infinity * 1f\2c oo)`
    );
  });
});

// --- precision -----------------------------------------------------------
describe('reduceCalc: Precision', () => {
  test('reduceCalc: precision option applies to numeric output', () => {
    assert.equal(reduceCalc('calc(1in + 10px)', { precision: 2 }), '1.1in');
  });

  test('reduceCalc: precision false keeps full float precision', () => {
    assert.match(
      reduceCalc('calc(1in + 10px)', { precision: false }),
      /1\.1041666666/
    );
  });

  test('reduceCalc: precision 0 rounds to whole numbers', () => {
    assert.equal(reduceCalc('calc(1in + 10px)', { precision: 0 }), '1in');
  });
});

// --- Option combinations -------------------------------------------------
describe('reduceCalc: option combinations', () => {
  test('reduceCalc: onParseError catches errors in a media-query param string', () => {
    const errors = [];
    reduceCalc('(min-width: calc(1px /))', {
      onParseError: (err) => errors.push(err),
    });
    assert.equal(errors.length, 1);
  });

  test('reduceCalc: reduces calc() in selector text', () => {
    assert.match(reduceCalc('a:nth-child(calc(1 + 2))'), /:nth-child\(3\)/);
  });

  test('reduceCalc: transforms selector text in place', () => {
    assert.equal(reduceCalc('a:nth-child(calc(1 + 2))'), 'a:nth-child(3)');
  });

  test('reduceCalc: selector transformations are idempotent', () => {
    assertIdempotent('a:nth-child(calc(1 + 2))');
  });

  test('reduceCalc: onParseError does not fire for fully-resolved inputs', () => {
    const errors = [];
    reduceCalc('calc(1px + 2px)', {
      onParseError: (err) => errors.push(err),
    });
    assert.equal(errors.length, 0);
  });

  test('reduceCalc: options are no-ops on values with no calc()', () => {
    const { output, warnings } = reduceWithWarnings('red', {
      warnWhenCannotResolve: true,
    });
    assert.equal(output, 'red');
    assert.equal(warnings.length, 0);
    assert.equal(reduceCalc('10px 20px'), '10px 20px');
  });
});

// --- Bare math functions (issue #189) -----------------------------------
describe('reduceCalc: bare math functions', () => {
  test('reduceCalc: simplifies bare min() outside of calc()', () => {
    assert.equal(
      reduceCalc('min(360px, 100% - 24px - 24px)'),
      'min(360px, 100% - 48px)'
    );
  });

  test('reduceCalc: detects escaped math-function names', () => {
    assert.equal(reduceCalc('c\\61 lc(1px + 2px)'), '3px');
    assert.equal(reduceCalc('m\\69 n(1px, 2px)'), '1px');
  });

  test('reduceCalc: simplifies bare max() outside of calc()', () => {
    assert.equal(reduceCalc('max(1px, 2px, 3px)'), '3px');
  });

  test('reduceCalc: simplifies bare clamp() outside of calc()', () => {
    assert.equal(reduceCalc('clamp(0px, 5px, 10px)'), '5px');
  });

  test('reduceCalc: simplifies clamp() with none keyword', () => {
    assert.equal(reduceCalc('clamp(none, 10px, 20px)'), '10px');
    assert.equal(reduceCalc('clamp(10px, 20px, none)'), '20px');
    assert.equal(reduceCalc('clamp(none, 10px, none)'), '10px');
    assert.equal(
      reduceCalc('clamp(none, var(--x), 20px)'),
      'min(var(--x), 20px)'
    );
  });

  test('reduceCalc: simplifies bare math functions case-insensitively', () => {
    assert.equal(reduceCalc('MIN(1px, 2px)'), '1px');
  });

  test('reduceCalc: simplifies a supported bare function from the dispatcher', () => {
    assert.equal(reduceCalc('pow(2, 3)'), '8');
  });

  test('reduceCalc: leaves unsupported bare functions untouched', () => {
    assert.equal(reduceCalc('unknown(1px + 2px)'), 'unknown(1px + 2px)');
  });

  test('reduceCalc: supported math is found inside unsupported functions', () => {
    assert.equal(reduceCalc('unknown(calc(1px + 2px))'), 'unknown(3px)');
  });

  test('reduceCalc: supported math is found inside nested simple blocks', () => {
    assert.equal(
      reduceCalc('unknown([calc(1px + 2px)] {max(3px, 4px)})'),
      'unknown([3px] {4px})'
    );
  });

  test('reduceCalc: a failing supported outer function suppresses its children', () => {
    const inputs = [];
    const fixture = 'calc(calc(1 /) + calc(1px + 2px))';
    const output = reduceCalc(fixture, {
      onParseError: (_, input) => inputs.push(input),
    });
    assert.equal(output, fixture);
    assert.deepEqual(inputs, ['calc(1 /) + calc(1px + 2px)']);
  });

  test('reduceCalc: stray malformed closers do not hide later calculations', () => {
    assert.equal(reduceCalc('] calc(1px + 2px)'), '] 3px');
  });

  test('reduceCalc: an unclosed function consumes through the end of a value', () => {
    assert.equal(reduceCalc('calc(1px + 2px'), '3px');
  });

  test('reduceCalc: leaves opaque-arg bare min() preserved', () => {
    assert.equal(reduceCalc('min(1px, var(--x))'), 'min(1px, var(--x))');
  });
});

// --- Source-range preservation ------------------------------------------
test('reduceCalc: IE backslash hack survives the outer walk untouched', () => {
  assert.equal(reduceCalc('calc(1px + 2px)\\9'), '3px\\9');
});

describe('reduceCalc: Escaped Content', () => {
  test('reduceCalc: escaped content value survives the outer walk untouched', () => {
    assert.equal(reduceCalc('"\\e901"'), '"\\e901"');
  });

  test('reduceCalc: unicode-range descriptor survives the outer walk untouched', () => {
    assert.equal(reduceCalc('U+0025-00FF'), 'U+0025-00FF');
  });

  test('reduceCalc: url() contents are opaque, even when they look like calc()', () => {
    assert.equal(reduceCalc('url(calc(1px).png)'), 'url(calc(1px).png)');
  });

  test('reduceCalc: grid line names survive alongside a reduced calc() term', () => {
    assert.equal(
      reduceCalc('[full-start] calc(1px + 2px) [full-end]'),
      '[full-start] 3px [full-end]'
    );
  });
});
