// A closer that does not match the innermost open block is ignored. These
// cases check that rule through the public string and token APIs.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '@csstools/css-tokenizer';
import reduceCalc from 'postcss-calc/reduce';
import reduceTokens from 'postcss-calc/reduce-tokens';

describe('mismatched closers through reduceCalc', () => {
  test('a closer that does not match the open block leaves the calc() unclosed', () => {
    const errors = [];
    const output = reduceCalc('calc(1px + [2px)', {
      onParseError: (error, input) => errors.push([error.message, input]),
    });
    assert.equal(output, 'calc(1px + [2px)');
    assert.deepEqual(errors, [
      ['Unclosed calc( at position 0', 'calc(1px + [2px)'],
    ]);
  });

  test('a mismatched closer inside a fallback is ignored and the calc() reduces', () => {
    const errors = [];
    const output = reduceCalc('var(--a, calc(1px ) ] )', {
      onParseError: (error, input) => errors.push([error.message, input]),
    });
    assert.equal(output, 'var(--a, calc(1px) ] )');
    assert.deepEqual(errors, []);
  });
});

describe('mismatched closers through reduceTokens', () => {
  test('a closer that does not match leaves the list unchanged and reports the calc()', () => {
    const errors = [];
    const replacements = reduceTokens(tokenize({ css: 'calc(1px + [2px) x' }), {
      onParseError: (error, input) => errors.push([error.message, input]),
    });
    assert.deepEqual(replacements, []);
    assert.deepEqual(errors, [
      ['Unclosed calc( at position 0', 'calc(1px + [2px) x'],
    ]);
  });
});
