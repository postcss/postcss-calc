// Unit tests for sexpr.ts — AST → S-expression renderer.
// sexpr is a debug helper; if it breaks, the parser/serializer tests that
// rely on it will fail loudly. Tests here only pin the shape rules that
// downstream tests depend on:
//
//   - leaves render as raw values (Num/Dim include their sign)
//   - Sum terms with sign=-1 wrap in `(- …)` (Num/Dim leaves never reach
//     this branch — mkSum normalizes them — but opaque nodes do)
//   - Product factors with exponent=-1 wrap in `(/ …)`

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { num, dim, ident, call, mkSum, mkProduct } from '../../src/core/node.ts';
import { sexpr } from '../helpers/sexpr.ts';

test('sexpr: leaves render as raw values (sign baked into Num/Dim)', () => {
  assert.equal(sexpr(num(5)), '5');
  assert.equal(sexpr(num(-5)), '-5');
  assert.equal(sexpr(dim(10, 'px')), '10px');
  assert.equal(sexpr(dim(-3, 'em')), '-3em');
  assert.equal(sexpr(ident('--foo')), '--foo');
});

test('sexpr: Sum prefixes with + and wraps negative-sign opaque terms in (- …)', () => {
  // mkSum keeps sign=-1 only when the node can't carry it (Ident here).
  // Num/Dim negatives live in the value, so they never reach the wrapper.
  const s = mkSum([
    { sign: 1, node: num(1) },
    { sign: -1, node: num(2) }, // normalizes to {+1, Num(-2)} → renders as `-2`
    { sign: -1, node: ident('x') },
  ]);
  assert.equal(sexpr(s), '(+ 1 -2 (- x))');
});

test('sexpr: Product prefixes with * and wraps negative-exponent factors in (/ …)', () => {
  const p = mkProduct([
    { exponent: 1, node: ident('a') },
    { exponent: -1, node: ident('b') },
  ]);
  assert.equal(sexpr(p), '(* a (/ b))');
});

test('sexpr: Call renders zero-arg, multi-arg, and nested forms', () => {
  assert.equal(sexpr(call('pi', [])), '(pi)');
  assert.equal(
    sexpr(call('clamp', [num(0), num(5), num(10)])),
    '(clamp 0 5 10)'
  );
  assert.equal(
    sexpr(call('min', [num(1), call('max', [num(2), num(3)])])),
    '(min 1 (max 2 3))'
  );
});

test('sexpr: composition renders mixed Sum/Product/Call/leaves cleanly', () => {
  // calc(1 + 2 * (3 - 4) + min(5, 6))
  const inner = mkSum([
    { sign: 1, node: num(3) },
    { sign: -1, node: num(4) }, // → +1, Num(-4)
  ]);
  const prod = mkProduct([
    { exponent: 1, node: num(2) },
    { exponent: 1, node: inner },
  ]);
  const root = mkSum([
    { sign: 1, node: num(1) },
    { sign: 1, node: prod },
    { sign: 1, node: call('min', [num(5), num(6)]) },
  ]);
  assert.equal(sexpr(root), '(+ 1 (* 2 (+ 3 -4)) (min 5 6))');
});
