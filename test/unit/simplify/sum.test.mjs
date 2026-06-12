import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';
test('simplify: adds same-unit lengths', () => {
  assert.equal(out('calc(1px + 2px + 3px)'), '6px');
});
test('simplify: subtracts same-unit lengths', () => {
  assert.equal(out('calc(10px - 3px - 2px)'), '5px');
});
test('simplify: converts across the same length family', () => {
  assert.equal(out('calc(1in + 10px)'), '1.10417in');
  assert.equal(out('calc(1cm + 10mm)'), '2cm');
});
test('simplify: relative units stay in their own bucket (em not foldable with px)', () => {
  assert.equal(out('calc(1em + 10px)'), 'calc(1em + 10px)');
});
test('simplify: percentage stays its own type (no context to mix with length)', () => {
  assert.equal(out('calc(100% - 30px)'), 'calc(100% - 30px)');
});
test('simplify: cancellation yields 0', () => {
  assert.equal(out('calc(1px - 1px)'), '0px');
  assert.equal(out('calc(5 - 5)'), '0');
});
test('simplify: like terms across parentheses', () => {
  assert.equal(out('calc(50px - (20px - 30px))'), '60px');
});
// Phase 1: bucket by EXACT unit so same-unit terms always merge.
// Phase 2: merge buckets whose units are in the same conversion family
// (first-encountered unit wins).
test('bucket: same-unit merges even when a different base-sibling took first', () => {
  // vh grabs the first length slot, but rem terms still merge with each
  // other because we bucket by exact unit, not just by base type.
  assert.equal(
    out('calc(100vh - 5rem - 10rem - 100px)'),
    'calc(100vh - 15rem - 100px)'
  );
});
test('bucket: cross-family conversion merges (in + px)', () => {
  // 1in = 96px; result in first-encountered unit (in).
  assert.equal(out('calc(1in + 96px)'), '2in');
});
test('bucket: chained cross-family conversion (1in + 10px + 1in)', () => {
  // Both in buckets merge; px folded into in.
  // 1 + 1 + 10/96 = 2.10417in (rounded to 5 decimals).
  assert.equal(out('calc(1in + 10px + 1in)'), '2.10417in');
});
test('bucket: non-convertible same-base units stay separate', () => {
  // em, rem, px share base `length` but only px has a static factor. The
  // others each get their own bucket and merge only with themselves.
  assert.equal(
    out('calc(1em + 1rem + 1em + 2rem + 3px)'),
    'calc(2em + 3rem + 3px)'
  );
});
test('bucket: bucket order follows source (first-encountered)', () => {
  // rem appears before em; output respects that order.
  assert.equal(out('calc(1rem + 1em + 1rem)'), 'calc(2rem + 1em)');
});
