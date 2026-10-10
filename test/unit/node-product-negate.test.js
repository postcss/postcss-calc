// Unit tests for node.ts — AST constructors and canonical-form invariants.
// Every invariant the rest of the pipeline relies on is asserted here
// directly, not through the parser or simplifier.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  num,
  dim,
  ident,
  mkSum,
  mkProduct,
  negate,
} from '../../src/lib/node.js';

describe('mkProduct:', () => {
  test('mkProduct: zero factors collapses to Num(1)', () => {
    assert.deepEqual(mkProduct([]), { type: 'Num', value: 1 });
  });

  test('mkProduct: single positive-exponent factor unwraps', () => {
    const result = mkProduct([{ exponent: 1, node: dim(2, 'px') }]);
    assert.deepEqual(result, { type: 'Dim', value: 2, unit: 'px' });
  });

  test('mkProduct: single negative-exponent factor stays as Product', () => {
    const result = mkProduct([{ exponent: -1, node: dim(2, 'px') }]);
    assert.equal(result.type, 'Product');
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
});

describe('negate', () => {
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

  test('negate: grouped multi-term Sum preserves the group', () => {
    const s = /** @type {import('../../src/lib/node.js').Sum} */ ({
      ...mkSum([
        { sign: 1, node: ident('a') },
        { sign: -1, node: ident('b') },
      ]),
      grouped: true,
    });
    assert.deepEqual(negate(s), {
      type: 'Sum',
      terms: [{ sign: -1, node: s }],
    });
  });

  test('negate: Product wraps in single-term negative Sum', () => {
    const p = mkProduct([
      { exponent: 1, node: ident('a') },
      { exponent: 1, node: ident('b') },
    ]);
    const result = negate(p);
    assert.equal(result.type, 'Sum');
    const terms = result.terms;
    assert.equal(terms.length, 1);
    assert.equal(terms[0].sign, -1);
  });
});
