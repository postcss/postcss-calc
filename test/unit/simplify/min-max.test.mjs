import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';
test('simplify: min folds when all args share a type', () => {
  assert.equal(out('min(1px, 2px, 3px)'), '1px');
});
test('simplify: max folds when all args share a type', () => {
  assert.equal(out('max(1em, 2em, 3em)'), '3em');
});
test('simplify: min converts units within a family before comparing', () => {
  // 1in = 96px, so min(1in, 10px) = min(1in, 0.10417in) = 0.10417in.
  // First arg's unit is canonical — consistent with the sum-bucket rule.
  assert.equal(out('min(1in, 10px)'), '0.10417in');
});
test('simplify: min preserved when types mix', () => {
  assert.equal(out('min(1px, 1em)'), 'min(1px, 1em)');
});
test('simplify: min preserved when an arg is opaque', () => {
  assert.equal(out('min(1px, var(--x))'), 'min(1px, var(--x))');
});
test('simplify: nested min / max', () => {
  assert.equal(out('max(1px, min(2px, 3px))'), '2px');
});
test('min with NaN propagates → calc(NaN)', () => {
  // Math.min(NaN, 5) is NaN (IEEE-754).
  assert.equal(out('min(NaN, 5)'), 'calc(NaN)');
});

test('min with subtraction', () => {
  assert.equal(
    out('min(360px, 100% - 24px - 24px)'),
    'min(360px, 100% - 48px)'
  );
})
