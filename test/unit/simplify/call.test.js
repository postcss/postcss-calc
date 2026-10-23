import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupMathFunction } from '../../../src/lib/functions.js';

test('lookupMathFunction: recognizes every implemented bare math function', () => {
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
    assert.notEqual(lookupMathFunction(name), undefined, name);
    assert.notEqual(lookupMathFunction(name.toUpperCase()), undefined, name);
  }

  for (const name of ['calc', '-webkit-calc', '-moz-calc']) {
    assert.notEqual(lookupMathFunction(name), undefined, name);
  }

  for (const name of ['var', 'unknown']) {
    assert.equal(lookupMathFunction(name), undefined, name);
  }
});
