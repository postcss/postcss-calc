import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';

test('does not output warnings', () => {
  assert.equal(
    out('calc(5.08lvh * var(--something))'),
    'calc(5.08lvh * var(--something))'
  );
});

test('multiple variable fallback', () => {
  assert.equal(
    out(
      'var(--width-lg, var(--width-md, var(--width-sm, 0))) + var(--offset-lg, var(--offset-md, var(--offset-sm, 0)))'
    ),
    'calc(var(--width-lg, var(--width-md, var(--width-sm, 0))) + var(--offset-lg, var(--offset-md, var(--offset-sm, 0))))'
  );
});

test('converts nested vars', () => {
  assert.equal(
    out(
      'calc(\n' +
        '    max(\n' +
        '       var(1, var(2,3)), \n' +
        '       var(4, var(5,6))\n' +
        '    ) * 1)'
    ),
    'max(var(1, var(2, 3)), var(4, var(5, 6)))'
  );
});

test('handles negative values at the end', () => {
  assert.equal(out('calc(var(--my-var) * -1)'), 'calc(-1 * var(--my-var))');
});

test('can minimize float with unknown unit', () => {
  assert.equal(out('calc(120rpx - 41.7rpx)'), '78.3rpx');
});

test('can minimize custom property and unknown unit', () => {
  assert.equal(
    out('var(--my-css-var) + -0.3cap'),
    'calc(-0.3cap + var(--my-css-var))'
  );
});

test('can minimize clamp and nested values', () => {
  assert.equal(
    out(
      'calc(\n' +
        '        1\n' +
        '        * clamp(\n' +
        '            1 ,\n' +
        '            ((1 * 1) * 1) ,\n' +
        '            1\n' +
        '        )\n' +
        '    )'
    ),
    '1'
  );
});

test('can minimize max and min with custom property', () => {
  assert.equal(
    out('calc(min(max(var(--foo), 0), 100))'),
    'min(max(var(--foo), 0), 100)'
  );
});

test('can minimize nested combination of custom properties and multiplication', () => {
  assert.equal(out('calc(var(--b, calc(var(--c) * 1)))'), 'var(--b, var(--c))');
});
