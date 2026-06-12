import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';
test('fold: single-arg min folds to its arg', () => {
  assert.equal(out('min(5)'), '5');
});
test('fold: empty-args min has zero args — returns null, preserve', () => {
  // min()/max() with no args is spec-invalid but our parser allows it.
  // foldConstArgs returns null on empty; the Call is preserved as-is.
  assert.equal(out('min()'), 'min()');
});
test('fold: mixed Num + Dim in min preserves the whole call', () => {
  assert.equal(out('min(1, 2px)'), 'min(1, 2px)');
});
test('fold: unknown unit blocks folding', () => {
  // 1foo has no base type → foldConstArgs returns null.
  assert.equal(out('min(1foo, 2foo)'), 'min(1foo, 2foo)');
});
