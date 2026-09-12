// Standalone reduceCalc tests. Mirrors test/unit/plugin.test.js for cases
// that operate on a CSS value string rather than PostCSS node walking.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc from 'postcss-calc/reduce';

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

describe('reduceCalc: nested fallbacks and prefixes', () => {
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
