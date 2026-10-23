// A reducer from `createReducer` sends its warnings and parse errors to the
// target it is called with, or to `onParseError` when that option is set.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '@csstools/css-tokenizer';
import { createReducer } from 'postcss-calc/reduce-tokens';

/** A target that records each `warn(message, plugin)` call. */
function recordingTarget() {
  const calls = [];
  return {
    calls,
    warn(message, plugin) {
      calls.push([message, plugin]);
    },
  };
}

describe('createReducer warnings', () => {
  test('an unresolved expression is warned through the target as postcss-calc', () => {
    const target = recordingTarget();
    const reduce = createReducer({ warnWhenCannotResolve: true });
    reduce(tokenize({ css: 'calc(1px + var(--a))' }), target);
    assert.deepEqual(target.calls, [
      ['Could not reduce expression: calc(1px + var(--a))', 'postcss-calc'],
    ]);
  });
});

describe('createReducer onWarn', () => {
  test('an onWarn option takes precedence over the target', () => {
    const target = recordingTarget();
    const messages = [];
    const reduce = createReducer({
      warnWhenCannotResolve: true,
      onWarn: (message) => messages.push(message),
    });
    reduce(tokenize({ css: 'calc(1px + var(--a))' }), target);
    assert.deepEqual(messages, [
      'Could not reduce expression: calc(1px + var(--a))',
    ]);
    assert.deepEqual(target.calls, []);
  });
});

describe('createReducer parse errors', () => {
  test('a parse error goes to onParseError and not to the target when it is set', () => {
    const target = recordingTarget();
    const errors = [];
    const reduce = createReducer({
      onParseError: (error) => errors.push(error.message),
    });
    reduce(tokenize({ css: 'calc(1px +)' }), target);
    assert.deepEqual(errors, [
      '"+" must be surrounded by whitespace at position 9',
    ]);
    assert.deepEqual(target.calls, []);
  });

  test('a parse error goes to the target as postcss-calc when onParseError is unset', () => {
    const target = recordingTarget();
    const reduce = createReducer();
    reduce(tokenize({ css: 'calc(1px +)' }), target);
    assert.deepEqual(target.calls, [
      ['"+" must be surrounded by whitespace at position 9', 'postcss-calc'],
    ]);
  });
});

describe('createReducer range', () => {
  test('a reducer reduces only the tokens of the range it is given', () => {
    const target = recordingTarget();
    const reduce = createReducer();
    const tokens = tokenize({ css: 'calc(1px + 1px) calc(2px + 2px)' });
    const replacements = reduce(tokens, target, 0, 7);
    assert.deepEqual(
      replacements.map((replacement) => [replacement.start, replacement.end]),
      [[0, 7]]
    );
  });

  test('a reducer skips the tokens before its range start', () => {
    const target = recordingTarget();
    const reduce = createReducer();
    const tokens = tokenize({ css: 'calc(1px + 1px) calc(2px + 2px)' });
    const replacements = reduce(tokens, target, 8);
    assert.deepEqual(
      replacements.map((replacement) => [replacement.start, replacement.end]),
      [[8, 15]]
    );
  });
});
