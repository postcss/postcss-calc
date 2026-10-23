// Diagnostic order and wording when one value has several problems. Callbacks
// are reported in candidate order, so the first error can differ from the one
// the reducer reported before the token-core refactor.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc from 'postcss-calc/reduce';

describe('callback order', () => {
  test('parse errors and warnings interleave in source order', () => {
    const value = 'calc(1px +) calc(1px + var(--a)) calc(1px 2px)';
    const events = [];
    reduceCalc(value, {
      warnWhenCannotResolve: true,
      onParseError: (error) => events.push(['parse', error.message]),
      onWarn: (message) => events.push(['warn', message]),
    });
    assert.deepEqual(events, [
      ['parse', '"+" must be surrounded by whitespace at position 9'],
      ['warn', `Could not reduce expression: ${value}`],
      ['parse', 'Unexpected token "2px" at position 42'],
    ]);
  });
});

describe('several errors in one function', () => {
  test('the operator error is reported before the later character error', () => {
    const errors = [];
    const output = reduceCalc('clamp(.5/*c*/+!;)', {
      onParseError: (error, input) => errors.push([error.message, input]),
    });
    assert.equal(output, 'clamp(.5/*c*/+!;)');
    assert.deepEqual(errors, [
      [
        '"+" must be surrounded by whitespace at position 13',
        'clamp(.5/*c*/+!;)',
      ],
    ]);
  });
});
