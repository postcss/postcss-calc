import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serialize } from '../../../lib/serialize.js';
import { mkSum, mkProduct, type Node } from '../../../lib/node.js';

// Direct serialize() tests — build canonical AST nodes by hand to pin
// output shape without depending on the parser/simplify.

// Signed-leaf canonical form: negatives live directly in the Num/Dim
// value — no wrapper needed.
const num = (v: number): Node => ({ type: 'Num', value: v });
const dim = (v: number, u: string): Node => ({ type: 'Dim', value: v, unit: u });

test('serialize: single number — no calc wrapper', () => {
  assert.equal(serialize(num(42)), '42');
});

test('serialize: single dimension — no calc wrapper', () => {
  assert.equal(serialize(dim(10, 'px')), '10px');
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
  const ast: Node = {
    type: 'Call',
    name: 'min',
    args: [dim(1, 'px'), dim(2, 'px')],
  };
  assert.equal(serialize(ast), 'min(1px, 2px)');
});

test('serialize: var() call', () => {
  const ast: Node = {
    type: 'Call',
    name: 'var',
    args: [{ type: 'Ident', name: '--x' }],
  };
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

test('serialize: negative Dim via signed leaf → bare -Xpx', () => {
  // Negatives live directly in the Dim value. The constructor helper
  // `dim(-1, 'px')` returns a Dim with value -1, no Sum wrapper.
  assert.equal(serialize(dim(-1, 'px')), '-1px');
});

test('serialize: single-term Sum with opaque gets calc wrapper', () => {
  // `-var(--x)` needs calc() so the leading minus isn't ambiguous.
  const ast = mkSum([
    { sign: -1, node: { type: 'Call', name: 'var', args: [{ type: 'Ident', name: '--x' }] } },
  ]);
  assert.equal(serialize(ast), 'calc(-var(--x))');
});

test('serialize: precision option applied to numbers and dimensions', () => {
  assert.equal(
    serialize(dim(1.123456789, 'px'), { precision: 2 }),
    '1.12px'
  );
  assert.equal(serialize(num(1.123456789), { precision: 0 }), '1');
});

test('serialize: precision false keeps full value', () => {
  assert.equal(
    serialize(dim(1.123456789, 'px'), { precision: false }),
    '1.123456789px'
  );
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

// --- Mutation-targeted tests ---------------------------------------------

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

test('serialize: negative leading Num serializes without calc() wrap', () => {
  // Top-level bare Num(-5) — no calc() needed.
  assert.equal(serialize({ type: 'Num', value: -5 }), '-5');
});

test('serialize: single-term Sum with sign=-1 and opaque Call → calc(-call)', () => {
  // `-var(--x)` shape — only reachable as a directly-constructed Sum
  // (parser never produces it; mkSum would collapse if leaf).
  const ast: Node = {
    type: 'Sum',
    terms: [
      {
        sign: -1,
        node: { type: 'Call', name: 'var', args: [{ type: 'Ident', name: '--x' }] },
      },
    ],
  };
  assert.equal(serialize(ast), 'calc(-var(--x))');
});

test('serialize: single-term Sum with sign=-1 and Product needs outer parens', () => {
  // `-(a * b)` must wrap the product so unary `-` binds the whole thing
  // on re-parse (otherwise `-a * b` = `(-a) * b`).
  const ast: Node = {
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
  assert.equal(serialize(ast), 'calc(-(a * b))');
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
  const ast: Node = {
    type: 'Product',
    factors: [{ exponent: -1, node: dim(2, 'px') }],
  };
  assert.equal(serialize(ast), 'calc(1 / 2px)');
});

// --- §10.13 degenerate-numeric serialization ----------------------------

test('serialize: Num(Infinity) → calc(infinity)', () => {
  assert.equal(serialize(num(Infinity)), 'calc(infinity)');
});

test('serialize: Num(-Infinity) → calc(-infinity)', () => {
  assert.equal(serialize(num(-Infinity)), 'calc(-infinity)');
});

test('serialize: Num(NaN) → calc(NaN)', () => {
  assert.equal(serialize(num(NaN)), 'calc(NaN)');
});

test('serialize: Dim(Infinity, px) → calc(infinity * 1px)', () => {
  assert.equal(serialize(dim(Infinity, 'px')), 'calc(infinity * 1px)');
});

test('serialize: Dim(-Infinity, px) → calc(-infinity * 1px)', () => {
  assert.equal(serialize(dim(-Infinity, 'px')), 'calc(-infinity * 1px)');
});

test('serialize: Dim(NaN, deg) → calc(NaN * 1deg)', () => {
  assert.equal(serialize(dim(NaN, 'deg')), 'calc(NaN * 1deg)');
});

test('serialize: degenerate uses calcName option (vendor prefix)', () => {
  assert.equal(
    serialize(num(Infinity), { calcName: '-webkit-calc' }),
    '-webkit-calc(infinity)'
  );
  assert.equal(
    serialize(dim(NaN, 'px'), { calcName: '-moz-calc' }),
    '-moz-calc(NaN * 1px)'
  );
});

test('serialize: precision does not round Infinity / NaN', () => {
  assert.equal(serialize(num(Infinity), { precision: 2 }), 'calc(infinity)');
  assert.equal(serialize(dim(NaN, 'px'), { precision: 0 }), 'calc(NaN * 1px)');
});

test('serialize: degenerate Num inside Sum context emits keyword', () => {
  // var(--x) + Infinity → keyword spelling, no nested calc().
  const ast = mkSum([
    { sign: 1, node: { type: 'Ident', name: 'var(--x)' } },
    { sign: 1, node: num(Infinity) },
  ]);
  assert.equal(serialize(ast), 'calc(var(--x) + infinity)');
});

test('serialize: NaN keeps canonical casing (never nan/NAN)', () => {
  // §10.7.2 line 1182.
  assert.equal(serialize(num(NaN)).includes('NaN'), true);
  assert.equal(serialize(num(NaN)).includes('nan'), false);
});
