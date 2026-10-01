import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize } from '../../src/lib/serialize.js';
import { parseSource } from '../helpers/parse-source.js';
import {
  num,
  dim,
  call,
  opaqueCall,
  ident,
  mkSum,
  mkProduct,
} from '../../src/lib/node.js';

const rounded = (value) =>
  Number(serialize(num(value), { precision: 5 }).slice(5, -1));

describe('serialize: precision and rounding', () => {
  test('serialize: precision option applied to numbers and dimensions', () => {
    assert.equal(
      serialize(dim(1.123456789, 'px'), { precision: 2 }),
      'calc(1.12px)'
    );
    assert.equal(serialize(num(1.123456789), { precision: 0 }), 'calc(1)');
    assert.equal(serialize(num(1.4), { precision: 0 }), 'calc(1)');
    assert.equal(serialize(num(1.4), { precision: 1 }), 'calc(1.4)');
  });

  test('serialize: precision false keeps full value', () => {
    assert.equal(
      serialize(dim(1.123456789, 'px'), { precision: false }),
      'calc(1.123456789px)'
    );
    assert.equal(
      serialize(num(1 / 3), { precision: false }),
      'calc(.3333333333333333)'
    );
    assert.equal(
      serialize(dim(1 / 3, 'px'), { precision: false }),
      'calc(.3333333333333333px)'
    );
  });

  test('serialize: rounds decimal midpoints away from zero accurately', () => {
    assert.equal(serialize(num(1.005), { precision: 2 }), 'calc(1.01)');
    assert.equal(serialize(num(-1.005), { precision: 2 }), 'calc(-1.01)');
    assert.equal(serialize(dim(1.005, 'px'), { precision: 2 }), 'calc(1.01px)');
    assert.equal(
      serialize(dim(-1.005, 'px'), { precision: 2 }),
      'calc(-1.01px)'
    );
    assert.equal(serialize(num(1.000005), { precision: 5 }), 'calc(1.00001)');
    assert.equal(serialize(num(-1.000005), { precision: 5 }), 'calc(-1.00001)');
  });

  test('serialize: rounds large fractional magnitudes without float drift', () => {
    // Scaling through Number(text + 'e' + p) loses the rounding boundary once
    // the shifted value exceeds Number.MAX_SAFE_INTEGER.
    assert.equal(
      serialize(num(312834450754803.44), { precision: 1 }),
      'calc(312834450754803.4)'
    );
    assert.equal(
      serialize(num(312834450754803.44), { precision: 6 }),
      'calc(312834450754803.44)'
    );
    assert.equal(
      serialize(dim(-312834450754803.44, 'px'), { precision: 1 }),
      'calc(-312834450754803.4px)'
    );
    assert.equal(
      serialize(num(39969.492943459234), { precision: 11 }),
      'calc(39969.49294345923)'
    );
  });

  test('serialize: carries a rounding carry through trailing nines', () => {
    // Rounding up 999.995 must propagate the carry across all nines to 1000.
    assert.equal(serialize(num(999.995), { precision: 2 }), 'calc(1000)');
    assert.equal(serialize(num(-999.995), { precision: 2 }), 'calc(-1000)');
    // All-nines carry combined with digit-string rounding beyond the safe
    // shift range.
    assert.equal(
      serialize(num(999999999999.995), { precision: 2 }),
      'calc(1000000000000)'
    );
  });

  test('serialize: rounds sub-1 midpoints away from zero and preserves sub-precision values', () => {
    assert.equal(serialize(num(0.15), { precision: 1 }), 'calc(.2)');
    assert.equal(serialize(num(-0.15), { precision: 1 }), 'calc(-.2)');
    assert.equal(serialize(num(0.0125), { precision: 2 }), 'calc(.013)');
    // Values below 1 keep `precision` significant digits, so 0.004 survives
    // a precision of 1 instead of collapsing to 0.
    assert.equal(serialize(num(0.004), { precision: 1 }), 'calc(.004)');
    assert.equal(serialize(num(-0.004), { precision: 1 }), 'calc(-.004)');
  });

  test('serialize: rounds values below 1 to a uniform number of significant digits', () => {
    assert.equal(serialize(num(0.0123456), { precision: 5 }), 'calc(.012346)');
    assert.equal(
      serialize(dim(1 / 150000, 'px'), { precision: 5 }),
      'calc(.0000066667px)'
    );
  });

  test('serialize: rounding never decreases as the input grows below 1', () => {
    let previous = 0;
    for (let exponent = -7; exponent < 0; exponent += 0.01) {
      const value = 10 ** exponent;
      const result = rounded(value);
      assert.ok(
        result >= previous,
        `${value} rounded to ${result} < ${previous}`
      );
      previous = result;
    }
    // No gap around 5e-6, where fixed decimals used to collapse values.
    assert.ok(rounded(4.9e-6) > 0);
    assert.ok(rounded(5.1e-6) >= rounded(4.9e-6));
  });

  test('serialize: leaves values unchanged when precision exceeds the shortest representation', () => {
    // The shortest decimal of 7341.0297734398655 has 14 fractional digits,
    // so rounding at precision 14 must return the value untouched instead of
    // rescaling through digit strings.
    assert.equal(
      serialize(num(7341.0297734398655), { precision: 14 }),
      'calc(7341.0297734398655)'
    );
  });

  test('serialize: precision 0 rounds to integers away from zero', () => {
    assert.equal(serialize(num(1.5), { precision: 0 }), 'calc(2)');
    assert.equal(serialize(num(-1.5), { precision: 0 }), 'calc(-2)');
    assert.equal(serialize(dim(1.2, 'px'), { precision: 0 }), 'calc(1px)');
    assert.equal(serialize(dim(-1.2, 'px'), { precision: 0 }), 'calc(-1px)');
  });

  test('serialize: negative and fractional precisions are clamped and truncated', () => {
    assert.equal(serialize(num(1.5), { precision: -1 }), 'calc(2)');
    assert.equal(serialize(num(-1.5), { precision: -2 }), 'calc(-2)');
    assert.equal(serialize(num(1.005), { precision: 2.5 }), 'calc(1.01)');
    assert.equal(
      serialize(dim(1.005, 'px'), { precision: 2.9 }),
      'calc(1.01px)'
    );
  });

  test('serialize: boundary precisions avoid NaN overflow', () => {
    assert.equal(serialize(num(1), { precision: 20 }), 'calc(1)');
    assert.equal(serialize(dim(1, 'px'), { precision: 100 }), 'calc(1px)');
    assert.equal(serialize(num(1), { precision: 310 }), 'calc(1)');
    assert.equal(serialize(dim(1, 'px'), { precision: 310 }), 'calc(1px)');
    assert.equal(serialize(num(1.5), { precision: 25 }), 'calc(1.5)');
    assert.equal(serialize(dim(1.5, 'px'), { precision: 25 }), 'calc(1.5px)');
  });

  test('serialize: handles input magnitudes in scientific notation, MAX_SAFE_INTEGER, and noise floor', () => {
    assert.equal(serialize(num(1e-7), { precision: 5 }), 'calc(1e-7)');
    assert.equal(serialize(num(1e-15), { precision: 5 }), 'calc(0)');
    assert.equal(serialize(num(1e21), { precision: 5 }), 'calc(1e+21)');
    assert.equal(
      serialize(num(Number.MAX_SAFE_INTEGER), { precision: 2 }),
      'calc(9007199254740991)'
    );
    assert.equal(
      serialize(dim(Number.MAX_SAFE_INTEGER, 'px'), { precision: 2 }),
      'calc(9007199254740991px)'
    );
  });

  test('serialize: preserves signed zero vs zero under custom precision', () => {
    const negNested = call('min', [num(-0), num(1)]);
    const posNested = call('min', [num(0), num(1)]);
    assert.equal(
      serialize(negNested, { precision: 2 }),
      'min(calc(-1 * 0), 1)'
    );
    assert.equal(serialize(posNested, { precision: 2 }), 'min(0, 1)');

    const negDim = call('min', [dim(-0, 'px'), dim(1, 'px')]);
    const posDim = call('min', [dim(0, 'px'), dim(1, 'px')]);
    assert.equal(
      serialize(negDim, { precision: 2 }),
      'min(calc(-1 * 0px), 1px)'
    );
    assert.equal(serialize(posDim, { precision: 2 }), 'min(0px, 1px)');
  });

  test('serialize: omits the leading zero from fractional numbers', () => {
    assert.equal(serialize(num(0.5)), 'calc(.5)');
    assert.equal(serialize(num(-0.000001)), 'calc(-.000001)');
    assert.equal(serialize(dim(0.25, 'px')), 'calc(.25px)');
    assert.equal(serialize(num(0)), 'calc(0)');
    assert.equal(serialize(num(1e-7)), 'calc(1e-7)');
  });

  test('serialize: lowers a signed zero number inside a calculation', () => {
    const nested = call('min', [num(-0), num(1)]);
    assert.equal(
      serialize(nested, { precision: false }),
      'min(calc(-1 * 0), 1)'
    );
  });

  test('serialize: lowers signed zero leaves inside structural expressions', () => {
    const ast = mkProduct([
      { exponent: 1, node: num(-0) },
      { exponent: 1, node: opaqueCall('var', [ident('--x')]) },
    ]);
    assert.equal(
      serialize(ast, { precision: false }),
      'calc(calc(-1 * 0) * var(--x))'
    );

    const dimensional = call('min', [dim(-0, 'px'), dim(1, 'px')]);
    assert.equal(
      serialize(dimensional, { precision: false }),
      'min(calc(-1 * 0px), 1px)'
    );
  });

  describe('serialize: sub-precision negative terms in sums and grouped sums', () => {
    test('sub-precision negative number term in sums respects precision', () => {
      const ast = mkSum([
        { sign: 1, node: num(-1e-20) },
        { sign: 1, node: opaqueCall('var', [ident('--x')]) },
      ]);
      assert.equal(serialize(ast), 'calc(0 + var(--x))');
      assert.equal(
        serialize(ast, { precision: false }),
        'calc(-1e-20 + var(--x))'
      );
    });

    test('sub-precision negative number term in grouped sums respects precision', () => {
      const ast = parseSource('(-1e-20 + var(--x))');
      assert.equal(serialize(ast), 'calc(0 + var(--x))');
      assert.equal(
        serialize(ast, { precision: false }),
        'calc(-1e-20 + var(--x))'
      );
    });

    test('negated grouped sum with non-leading sub-precision negative term serializes with positive sign', () => {
      const ast = {
        type: /** @type {const} */ ('Sum'),
        grouped: true,
        terms: [
          { sign: 1, node: dim(-10, 'px') },
          { sign: 1, node: dim(-1e-20, 'em') },
          { sign: 1, node: opaqueCall('var', [ident('--x')]) },
        ],
      };
      assert.equal(serialize(ast), 'calc(-10px + 0em + var(--x))');
    });

    test('negated grouped sum with non-leading sub-precision positive term serializes with positive sign', () => {
      const ast = {
        type: /** @type {const} */ ('Sum'),
        grouped: true,
        terms: [
          { sign: 1, node: dim(-10, 'px') },
          { sign: 1, node: dim(1e-20, 'em') },
          { sign: 1, node: opaqueCall('var', [ident('--x')]) },
        ],
      };
      assert.equal(serialize(ast), 'calc(-10px + 0em + var(--x))');
    });
  });
});
