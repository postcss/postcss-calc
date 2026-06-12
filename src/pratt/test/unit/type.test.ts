import { test } from 'node:test';
import assert from 'node:assert/strict';

import { baseOf, convert } from '../../../lib/type.js';

test('baseOf: returns base type for known units', () => {
  assert.equal(baseOf('px'), 'length');
  assert.equal(baseOf('em'), 'length');
  assert.equal(baseOf('deg'), 'angle');
  assert.equal(baseOf('s'), 'time');
  assert.equal(baseOf('hz'), 'frequency');
  assert.equal(baseOf('dppx'), 'resolution');
  assert.equal(baseOf('fr'), 'flex');
  assert.equal(baseOf('%'), 'percentage');
});

test('baseOf: case-insensitive', () => {
  assert.equal(baseOf('PX'), 'length');
  assert.equal(baseOf('Deg'), 'angle');
});

test('baseOf: returns null for unknown units', () => {
  assert.equal(baseOf('foo'), null);
  assert.equal(baseOf(''), null);
});

test('baseOf: modern viewport and container units map to length', () => {
  for (const u of ['svw', 'lvh', 'dvmin', 'cqw', 'cqh', 'cqi', 'cqmin']) {
    assert.equal(baseOf(u), 'length', `${u} should be length`);
  }
});

test('convert: same unit is identity (regardless of table entry)', () => {
  assert.equal(convert(42, 'em', 'em'), 42);
  assert.equal(convert(0, 'rem', 'rem'), 0);
});

test('convert: case-insensitive matching', () => {
  assert.equal(convert(1, 'PX', 'px'), 1);
  assert.equal(convert(10, 'IN', 'px'), 960);
});

test('convert: length family — in to px', () => {
  assert.equal(convert(1, 'in', 'px'), 96);
});

test('convert: length family — cm to mm', () => {
  // 96/2.54 / (96/25.4) is mathematically 10 but accumulates ~1e-15 drift.
  const result = convert(1, 'cm', 'mm')!;
  assert.ok(Math.abs(result - 10) < 1e-10, `got ${result}`);
});

test('convert: angle family — turn to deg', () => {
  assert.equal(convert(1, 'turn', 'deg'), 360);
  assert.equal(convert(0.25, 'turn', 'deg'), 90);
});

test('convert: time family — s to ms', () => {
  assert.equal(convert(1, 's', 'ms'), 1000);
});

test('convert: null for non-statically-convertible units (font-relative)', () => {
  assert.equal(convert(1, 'em', 'px'), null);
  assert.equal(convert(1, 'rem', 'px'), null);
});

test('convert: null for non-statically-convertible units (viewport)', () => {
  assert.equal(convert(1, 'vw', 'px'), null);
  assert.equal(convert(1, 'cqw', 'px'), null);
});

test('convert: null across different base types', () => {
  assert.equal(convert(1, 'px', 's'), null);
});
