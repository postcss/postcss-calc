// Diagnostic positions reported by `reduceCalc` after a long prefix.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc from 'postcss-calc/reduce';

describe('error position after a long prefix', () => {
  test('a parse error far into a calc() reports its exact offset', () => {
    const prefix = `calc(${'1px + '.repeat(500)}1px`;
    const value = `${prefix}+2px)`;
    const errors = [];
    const output = reduceCalc(value, {
      onParseError: (error, input) => errors.push([error.message, input]),
    });
    assert.equal(output, value);
    assert.deepEqual(errors, [
      [
        `"+" must be surrounded by whitespace at position ${prefix.length}`,
        value,
      ],
    ]);
  });

  test('the reported stack names the positioned message', () => {
    const errors = [];
    reduceCalc('calc(1px +2px)', {
      onParseError: (error) => errors.push(error),
    });
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof Error);
    assert.equal(
      errors[0].stack.split('\n')[0],
      'Error: "+" must be surrounded by whitespace at position 9'
    );
  });
});
