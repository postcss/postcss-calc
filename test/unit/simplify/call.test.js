import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedMathFunction } from '../../../src/lib/simplify/call.js';

test('isSupportedMathFunction: recognizes every implemented bare math function', () => {
  const supported = [
    'min',
    'max',
    'clamp',
    'abs',
    'sign',
    'mod',
    'rem',
    'round',
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'atan2',
    'pow',
    'sqrt',
    'hypot',
    'log',
    'exp',
  ];

  for (const name of supported) {
    assert.equal(isSupportedMathFunction(name), true, name);
    assert.equal(isSupportedMathFunction(name.toUpperCase()), true, name);
  }

  for (const name of ['calc', '-webkit-calc', '-moz-calc', 'var', 'unknown']) {
    assert.equal(isSupportedMathFunction(name), false, name);
  }
});
