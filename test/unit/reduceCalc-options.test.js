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
