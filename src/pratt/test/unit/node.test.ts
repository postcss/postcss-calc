// Unit tests for node.ts — AST constructors and canonical-form invariants.
// Every invariant the rest of the pipeline relies on is asserted here
// directly, not through the parser or simplifier.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  num,
  dim,
  ident,
  mkSum,
  mkProduct,
  negate,
  type Node,
} from '../../../lib/node.js';

// --- Leaf constructors ----------------------------------------------------
//
// num/dim/ident/call are pure object literals — the constructor doesn't
// transform inputs. The structural invariants tested below (mkSum, mkProduct,
// negate) rely on these returning what they're given. No need to assert
// object-equality on each leaf shape.

// --- mkSum canonical form -------------------------------------------------

test('mkSum: zero terms collapses to Num(0)', () => {
  assert.deepEqual(mkSum([]), { type: 'Num', value: 0 });
});

test('mkSum: single positive-sign term unwraps to the inner node', () => {
  const result = mkSum([{ sign: 1, node: dim(5, 'px') }]);
  assert.deepEqual(result, { type: 'Dim', value: 5, unit: 'px' });
});

test('mkSum: single negative-sign Num collapses sign into value', () => {
  // Canonical form: sign=-1 around Num becomes sign=+1 around Num(-X).
  // And a single positive-sign term unwraps.
  assert.deepEqual(mkSum([{ sign: -1, node: num(5) }]), {
    type: 'Num',
    value: -5,
  });
});

test('mkSum: single negative-sign Dim collapses sign into value', () => {
  assert.deepEqual(mkSum([{ sign: -1, node: dim(5, 'px') }]), {
    type: 'Dim',
    value: -5,
    unit: 'px',
  });
});

test('mkSum: single negative-sign opaque stays wrapped (no place to put the sign)', () => {
  const result = mkSum([{ sign: -1, node: ident('x') }]);
  assert.deepEqual(result, {
    type: 'Sum',
    terms: [{ sign: -1, node: { type: 'Ident', name: 'x' } }],
  });
});

test('mkSum: multi-term sum stays as Sum', () => {
  const result = mkSum([
    { sign: 1, node: num(1) },
    { sign: 1, node: dim(2, 'px') },
  ]);
  assert.equal((result as { type: 'Sum' }).type, 'Sum');
});

test('mkSum: 3-deep nested Sum flattens fully with chained sign composition', () => {
  // outer ⊃ mid ⊃ inner. mid wraps inner with sign=-1, so inner's terms
  // get their signs flipped. Signs on Num leaves normalize into the value.
  // Final terms (in order): inner[1]→{-,1}→Num(-1), inner[2]→{-,2}→Num(-2),
  // mid[3] passes through, outer[4] passes through.
  const inner = mkSum([
    { sign: 1, node: num(1) },
    { sign: 1, node: num(2) },
  ]);
  const mid = mkSum([
    { sign: -1, node: inner },
    { sign: 1, node: num(3) },
  ]);
  const outer = mkSum([
    { sign: 1, node: mid },
    { sign: 1, node: num(4) },
  ]);
  assert.deepEqual(outer, {
    type: 'Sum',
    terms: [
      { sign: 1, node: { type: 'Num', value: -1 } },
      { sign: 1, node: { type: 'Num', value: -2 } },
      { sign: 1, node: { type: 'Num', value: 3 } },
      { sign: 1, node: { type: 'Num', value: 4 } },
    ],
  });
});

test('mkSum: nested Sum is flattened with sign composition', () => {
  const inner: Node = mkSum([
    { sign: 1, node: ident('a') },
    { sign: -1, node: ident('b') },
  ]);
  const outer = mkSum([
    { sign: -1, node: inner },
    { sign: 1, node: ident('c') },
  ]);
  // Expected after flatten: -a → +b (flipped), -(-b) → +b, then +c.
  // Actually: outer sign=-1 multiplies inner signs: -1*1=-1 for a, -1*-1=+1 for b.
  assert.deepEqual(outer, {
    type: 'Sum',
    terms: [
      { sign: -1, node: { type: 'Ident', name: 'a' } },
      { sign: 1, node: { type: 'Ident', name: 'b' } },
      { sign: 1, node: { type: 'Ident', name: 'c' } },
    ],
  });
});

test('mkSum: zero-valued Num is dropped (contributes nothing)', () => {
  const result = mkSum([
    { sign: 1, node: num(5) },
    { sign: 1, node: num(0) },
  ]);
  // After dropping the zero, single positive term unwraps.
  assert.deepEqual(result, { type: 'Num', value: 5 });
});

test('mkSum: zero-valued Dim is KEPT (unit carries type info)', () => {
  const result = mkSum([
    { sign: 1, node: num(5) },
    { sign: 1, node: dim(0, 'px') },
  ]);
  assert.equal((result as { type: 'Sum' }).type, 'Sum');
  assert.equal((result as { terms: unknown[] }).terms.length, 2);
});

test('mkSum: all-zero Nums collapse entirely to Num(0)', () => {
  const result = mkSum([
    { sign: 1, node: num(0) },
    { sign: 1, node: num(0) },
  ]);
  assert.deepEqual(result, { type: 'Num', value: 0 });
});

test('mkSum: sign normalization works with pre-negative Num', () => {
  // Input: sign=-1 around Num(-5). Normalize flips: sign=+1 around Num(5).
  const result = mkSum([{ sign: -1, node: num(-5) }]);
  assert.deepEqual(result, { type: 'Num', value: 5 });
});

// --- mkProduct canonical form --------------------------------------------

test('mkProduct: zero factors collapses to Num(1)', () => {
  assert.deepEqual(mkProduct([]), { type: 'Num', value: 1 });
});

test('mkProduct: single positive-exponent factor unwraps', () => {
  const result = mkProduct([{ exponent: 1, node: dim(2, 'px') }]);
  assert.deepEqual(result, { type: 'Dim', value: 2, unit: 'px' });
});

test('mkProduct: single negative-exponent factor stays as Product', () => {
  const result = mkProduct([{ exponent: -1, node: dim(2, 'px') }]);
  assert.equal((result as { type: 'Product' }).type, 'Product');
});

test('mkProduct: factor of Num(1) is dropped', () => {
  const result = mkProduct([
    { exponent: 1, node: num(1) },
    { exponent: 1, node: ident('x') },
  ]);
  assert.deepEqual(result, { type: 'Ident', name: 'x' });
});

test('mkProduct: nested Product flattens with exponent composition', () => {
  const inner = mkProduct([
    { exponent: 1, node: ident('a') },
    { exponent: -1, node: ident('b') },
  ]);
  const outer = mkProduct([
    { exponent: -1, node: inner },
    { exponent: 1, node: ident('c') },
  ]);
  // outer_exp=-1 multiplied with inner exponents: a becomes -1, b becomes +1.
  assert.deepEqual(outer, {
    type: 'Product',
    factors: [
      { exponent: -1, node: { type: 'Ident', name: 'a' } },
      { exponent: 1, node: { type: 'Ident', name: 'b' } },
      { exponent: 1, node: { type: 'Ident', name: 'c' } },
    ],
  });
});

// --- negate ---------------------------------------------------------------

test('negate: Num flips value sign', () => {
  assert.deepEqual(negate(num(5)), { type: 'Num', value: -5 });
});

test('negate: Dim flips value sign', () => {
  assert.deepEqual(negate(dim(5, 'px')), {
    type: 'Dim',
    value: -5,
    unit: 'px',
  });
});

test('negate: double-negation is an identity transform', () => {
  assert.deepEqual(negate(negate(num(5))), { type: 'Num', value: 5 });
  assert.deepEqual(negate(negate(ident('x'))), { type: 'Ident', name: 'x' });
});

test('negate: ident wraps in single-term negative Sum', () => {
  assert.deepEqual(negate(ident('x')), {
    type: 'Sum',
    terms: [{ sign: -1, node: { type: 'Ident', name: 'x' } }],
  });
});

test('negate: multi-term Sum flips every term`s sign (and re-normalizes leaves)', () => {
  const s = mkSum([
    { sign: 1, node: num(5) },
    { sign: 1, node: ident('x') },
  ]);
  assert.deepEqual(negate(s), {
    type: 'Sum',
    terms: [
      { sign: 1, node: { type: 'Num', value: -5 } },
      { sign: -1, node: { type: 'Ident', name: 'x' } },
    ],
  });
});

test('negate: Product wraps in single-term negative Sum', () => {
  const p = mkProduct([
    { exponent: 1, node: ident('a') },
    { exponent: 1, node: ident('b') },
  ]);
  const result = negate(p);
  assert.equal((result as { type: 'Sum' }).type, 'Sum');
  const terms = (result as { terms: Array<{ sign: 1 | -1 }> }).terms;
  assert.equal(terms.length, 1);
  assert.equal(terms[0]!.sign, -1);
});

