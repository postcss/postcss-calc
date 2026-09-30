import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize as serializeSource } from '../../src/lib/serialize.js';
import {
  num,
  dim,
  call,
  opaqueCall,
  ident,
  mkSum,
  mkProduct,
} from '../../src/lib/node.js';

const serialize = (node, opts = {}) => serializeSource(node, opts);

describe('serialize: core syntax and expressions', () => {
  test('serialize: single number uses standard calculation syntax', () => {
    assert.equal(serialize(num(42)), 'calc(42)');
  });

  test('serialize: single dimension uses standard calculation syntax', () => {
    assert.equal(serialize(dim(10, 'px')), 'calc(10px)');
  });

  test('serialize: sum wrapped in calc(), spaces around +/-', () => {
    const ast = mkSum([
      { sign: 1, node: dim(1, 'px') },
      { sign: 1, node: dim(2, 'px') },
    ]);
    assert.equal(serialize(ast), 'calc(1px + 2px)');
  });

  test('serialize: spaces around every binary operator', () => {
    const ast = mkProduct([
      { exponent: 1, node: num(2) },
      { exponent: 1, node: dim(3, 'px') },
    ]);
    assert.equal(serialize(ast), 'calc(2 * 3px)');
  });

  test('serialize: self-wrapping call — no extra calc()', () => {
    const ast = {
      type: 'Call',
      name: 'min',
      args: [dim(1, 'px'), dim(2, 'px')],
    };
    assert.equal(serialize(ast), 'min(1px, 2px)');
  });

  test('serialize: var() call', () => {
    const ast = opaqueCall('var', [ident('--x')]);
    assert.equal(serialize(ast), 'var(--x)');
  });

  test('serialize: Sum inside Product gets parens', () => {
    // (1 + 2) * 3 — the Sum as a factor must be parenthesized.
    const innerSum = mkSum([
      { sign: 1, node: num(1) },
      { sign: 1, node: num(2) },
    ]);
    const ast = mkProduct([
      { exponent: 1, node: innerSum },
      { exponent: 1, node: num(3) },
    ]);
    assert.equal(serialize(ast), 'calc((1 + 2) * 3)');
  });

  test('serialize: negative Dim via signed leaf → calc(-Xpx)', () => {
    // Negatives live directly in the Dim value. The constructor helper
    // `dim(-1, 'px')` returns a Dim with value -1, no Sum wrapper.
    assert.equal(serialize(dim(-1, 'px')), 'calc(-1px)');
  });

  test('serialize: single-term Sum with opaque gets calc() function', () => {
    // `-1 * var(--x)` needs calc() so the leading minus isn't ambiguous.
    const ast = mkSum([
      {
        sign: -1,
        node: opaqueCall('var', [ident('--x')]),
      },
    ]);
    assert.equal(serialize(ast), 'calc(-1 * var(--x))');
  });

  test('serialize: custom calcName', () => {
    const ast = mkSum([
      { sign: 1, node: dim(1, 'px') },
      { sign: 1, node: dim(2, 'px') },
    ]);
    assert.equal(
      serialize(ast, { calcName: '-webkit-calc' }),
      '-webkit-calc(1px + 2px)'
    );
  });

  test('does not carry a negative scalar magnitude into positive siblings', () => {
    const ast = mkSum([
      { sign: 1, node: num(-2) },
      { sign: 1, node: num(3) },
      { sign: 1, node: dim(4, 'px') },
    ]);
    assert.equal(serialize(ast), 'calc(-2 + 3 + 4px)');
  });

  test('scopes negated product coefficients to one product', () => {
    const withCoefficient = mkSum([
      {
        sign: -1,
        node: mkProduct([
          { exponent: 1, node: num(2) },
          { exponent: 1, node: ident('x') },
        ]),
      },
    ]);
    const withoutCoefficient = mkSum([
      {
        sign: -1,
        node: mkProduct([
          { exponent: 1, node: ident('a') },
          { exponent: 1, node: ident('b') },
        ]),
      },
    ]);
    assert.equal(serialize(withCoefficient), 'calc(-2 * x)');
    assert.equal(serialize(withoutCoefficient), 'calc(-1 * a * b)');
    assert.equal(
      serialize(call('min', [withCoefficient, withoutCoefficient])),
      'min(-2 * x, -1 * a * b)'
    );
  });

  test('isolates nested sums and products across call arguments', () => {
    const ast = call('min', [
      mkSum([
        { sign: 1, node: num(1) },
        { sign: 1, node: num(2) },
      ]),
      mkProduct([
        { exponent: 1, node: num(2) },
        { exponent: 1, node: dim(3, 'px') },
      ]),
    ]);
    assert.equal(serialize(ast), 'min(1 + 2, 2 * 3px)');
  });

  test('serialize: displaySign flips negative Num to `-` operator', () => {
    // `5 + Num(-3)` should render as `5 - 3`, not `5 + -3`.
    // This kills the displaySign branch for Num with value<0.
    const ast = mkSum([
      { sign: 1, node: { type: 'Num', value: 5 } },
      { sign: 1, node: { type: 'Num', value: -3 } },
    ]);
    assert.equal(serialize(ast), 'calc(5 - 3)');
  });

  test('serialize: displaySign flips negative Dim to `-` operator', () => {
    // Same but for Dim leaves — `5px + Dim(-2, em)` → `5px - 2em`.
    const ast = mkSum([
      { sign: 1, node: { type: 'Dim', value: 5, unit: 'px' } },
      { sign: 1, node: { type: 'Dim', value: -2, unit: 'em' } },
    ]);
    assert.equal(serialize(ast), 'calc(5px - 2em)');
  });

  test('serialize: negative leading Num keeps calc() function', () => {
    assert.equal(serialize(num(-5)), 'calc(-5)');
  });

  test('serialize: single-term Sum with sign=-1 and opaque call → calc(-1 * call)', () => {
    // `-1 * var(--x)` shape — only reachable as a directly-constructed Sum
    // (parser never produces it; mkSum would collapse if leaf).
    const ast = {
      type: 'Sum',
      terms: [
        {
          sign: -1,
          node: opaqueCall('var', [ident('--x')]),
        },
      ],
    };
    assert.equal(serialize(ast), 'calc(-1 * var(--x))');
  });

  test('serialize: single-term Sum with sign=-1 and Product serializes as -1 * factors', () => {
    // `-1 * a * b` serializes without extra parentheses because multiplication is associative.
    const ast = {
      type: 'Sum',
      terms: [
        {
          sign: -1,
          node: {
            type: 'Product',
            factors: [
              { exponent: 1, node: { type: 'Ident', name: 'a' } },
              { exponent: 1, node: { type: 'Ident', name: 'b' } },
            ],
          },
        },
      ],
    };
    assert.equal(serialize(ast), 'calc(-1 * a * b)');
  });

  test('serialize: multi-term Sum with trailing zero-valued Dim', () => {
    // `1px + 0em` — both non-zero positions tested; exercises the
    // iteration body and operator choice for non-first terms.
    const ast = mkSum([
      { sign: 1, node: dim(1, 'px') },
      { sign: 1, node: dim(0, 'em') },
    ]);
    assert.equal(serialize(ast), 'calc(1px + 0em)');
  });

  test('serialize: Product with leading denominator emits implicit 1', () => {
    // `Product([{-1, 2px}])` (impossible from parser but constructible)
    // should emit `1 / 2px`, exercising the exponent=-1 first-factor branch.
    const ast = {
      type: 'Product',
      factors: [{ exponent: -1, node: dim(2, 'px') }],
    };
    assert.equal(serialize(ast), 'calc(1 / 2px)');
  });

  test('serialize: negated Product with leading denominator emits -1 / value', () => {
    // Negation of `1 / 2px` cannot fold into a signed Dim leaf, so it must
    // serialize as `-1 / 2px` rather than distributing over the denominator.
    const ast = mkSum([
      {
        sign: -1,
        node: mkProduct([{ exponent: -1, node: dim(2, 'px') }]),
      },
    ]);
    assert.equal(serialize(ast), 'calc(-1 / 2px)');
  });

  test('serialize: negating a Product with leading zero coefficient emits calc(-1 * 0) times the rest', () => {
    // The negated coefficient is -0, which must take the signed-zero path
    // (calc(-1 * 0)) instead of collapsing to plain `0` or `1`.
    const ast = mkSum([
      {
        sign: -1,
        node: mkProduct([
          { exponent: 1, node: num(0) },
          { exponent: 1, node: opaqueCall('var', [ident('--x')]) },
        ]),
      },
    ]);
    assert.equal(serialize(ast), 'calc(calc(-1 * 0) * var(--x))');
  });

  test('serialize: negating a Product with leading -0 coefficient emits positive zero times the rest', () => {
    // Negating -0 yields +0, so the signed-zero path must not trigger.
    const ast = mkSum([
      {
        sign: -1,
        node: mkProduct([
          { exponent: 1, node: num(-0) },
          { exponent: 1, node: opaqueCall('var', [ident('--x')]) },
        ]),
      },
    ]);
    assert.equal(serialize(ast), 'calc(0 * var(--x))');
  });

  test('serialize: negating a Product with leading Infinity coefficient emits -infinity times the rest', () => {
    // The negated coefficient is -Infinity and must take the degenerate
    // keyword path rather than the finite rounding path.
    const ast = mkSum([
      {
        sign: -1,
        node: mkProduct([
          { exponent: 1, node: num(Infinity) },
          { exponent: 1, node: opaqueCall('var', [ident('--x')]) },
        ]),
      },
    ]);
    assert.equal(serialize(ast), 'calc(-infinity * var(--x))');
  });

  test('serialize: negating a Product with leading -Infinity coefficient emits infinity times the rest', () => {
    const ast = mkSum([
      {
        sign: -1,
        node: mkProduct([
          { exponent: 1, node: num(-Infinity) },
          { exponent: 1, node: opaqueCall('var', [ident('--x')]) },
        ]),
      },
    ]);
    assert.equal(serialize(ast), 'calc(infinity * var(--x))');
  });
});
