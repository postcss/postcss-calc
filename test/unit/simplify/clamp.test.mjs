import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';
test('simplify: clamp folds when fully resolved', () => {
  assert.equal(out('clamp(0px, 5px, 10px)'), '5px');
  assert.equal(out('clamp(0px, -5px, 10px)'), '0px');
  assert.equal(out('clamp(0px, 50px, 10px)'), '10px');
});
test('simplify: clamp returns MIN when MIN > MAX (spec §10.8)', () => {
  // max(MIN, min(VAL, MAX)) — when MIN > MAX, MIN wins regardless of VAL.
  // Found by the differential randomizer against @csstools/css-calc.
  assert.equal(out('clamp(5, -2, -9)'), '5');
  assert.equal(out('clamp(0px, -2px, -1px)'), '0px');
  assert.equal(out('clamp(128, 64, 3)'), '128');
});
