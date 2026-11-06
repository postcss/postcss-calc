// The nesting limit counts a calc() that sits inside a var() fallback, and
// the calc() is reduced there, so its arguments are checked at the same depth.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc from 'postcss-calc/reduce';

const LIMIT = 1024;
const LIMIT_MESSAGE = `Calculation nesting exceeds the limit of ${LIMIT}`;
const nestedVarCalc = (n) =>
  `${'var(--x, '.repeat(n)}calc(1px + 1px)${')'.repeat(n)}`;
const reducedVarCalc = (n) =>
  `${'var(--x, '.repeat(n)}calc(2px)${')'.repeat(n)}`;

describe('nesting limit with a calc() inside a var() fallback', () => {
  test('a reduced calc() inside a var() fallback counts toward the limit', () => {
    // Each `var(` is one opener and the calc() inside the innermost one is
    // one more, so 1023 wrappers is 1024 openers in total.
    const errors = [];
    const output = reduceCalc(nestedVarCalc(LIMIT - 1), {
      onParseError: (error) => errors.push(error.message),
    });
    assert.deepEqual(errors, []);
    assert.equal(output, reducedVarCalc(LIMIT - 1));
  });

  test('one more wrapper past the limit is rejected and left unchanged', () => {
    const input = nestedVarCalc(LIMIT);
    const errors = [];
    const output = reduceCalc(input, {
      onParseError: (error, source) => errors.push([error.message, source]),
    });
    assert.equal(output, input);
    assert.deepEqual(errors, [[LIMIT_MESSAGE, input]]);
  });
});
