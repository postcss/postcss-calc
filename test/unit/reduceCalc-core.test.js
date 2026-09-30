// Standalone reduceCalc tests. Mirrors test/unit/plugin.test.js for cases
// that operate on a CSS value string rather than PostCSS node walking.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc from 'postcss-calc/reduce';

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
});
