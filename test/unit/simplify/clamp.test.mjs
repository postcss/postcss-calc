import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';

describe('simplify: Clamp Folds', () => {
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

  test('simplify: clamp with none keyword (spec §10.5.3)', () => {
    // clamp(none, VAL, MAX) is equivalent to min(VAL, MAX)
    assert.equal(out('clamp(none, 10px, 20px)'), '10px');
    assert.equal(out('clamp(none, 50px, 20px)'), '20px');
    assert.equal(out('clamp(none, var(--x), 20px)'), 'min(var(--x), 20px)');
    assert.equal(out('clamp(none, 10px, var(--x))'), 'min(10px, var(--x))');
    assert.equal(out('clamp(none, 10px, 20deg)'), 'min(10px, 20deg)');

    // clamp(MIN, VAL, none) is equivalent to max(MIN, VAL)
    assert.equal(out('clamp(10px, 20px, none)'), '20px');
    assert.equal(out('clamp(30px, 20px, none)'), '30px');
    assert.equal(out('clamp(10px, var(--x), none)'), 'max(10px, var(--x))');
    assert.equal(out('clamp(var(--x), 20px, none)'), 'max(var(--x), 20px)');
    assert.equal(out('clamp(10deg, 20px, none)'), 'max(10deg, 20px)');

    // clamp(none, VAL, none) is equivalent to calc(VAL) (or bare VAL)
    assert.equal(out('clamp(none, 10px, none)'), '10px');
    assert.equal(out('clamp(none, var(--x), none)'), 'var(--x)');
    assert.equal(out('clamp(none, 10px + 20px, none)'), '30px');
    assert.equal(
      out('clamp(none, var(--a) + var(--b), none)'),
      'calc(var(--a) + var(--b))'
    );

    // Case insensitivity
    assert.equal(out('clamp(NONE, 10px, 20px)'), '10px');
    assert.equal(out('clamp(10px, 20px, NONE)'), '20px');
    assert.equal(out('clamp(None, 10px, None)'), '10px');
  });
});
