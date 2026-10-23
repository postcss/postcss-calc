// Whitespace around operators, range edges, unclosed blocks, mismatched
// closers, nesting limits and negated opaque groups, through `reduceCalc`.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc from 'postcss-calc/reduce';

/** Run `reduceCalc` and collect each parse error as `[message, input]`. */
function reduceWithErrors(value, options = {}) {
  const errors = [];
  const output = reduceCalc(value, {
    ...options,
    onParseError: (error, input) => errors.push([error.message, input]),
  });
  return { output, errors };
}

/** Assert that `value` is left as is and reports exactly one error. */
function assertRejected(value, message) {
  assert.deepEqual(reduceWithErrors(value), {
    output: value,
    errors: [[message, value]],
  });
}

describe('comments and whitespace around operators', () => {
  test('a comment counts as whitespace before and after an operator', () => {
    for (const value of [
      'calc(1px/**/+ 2px)',
      'calc(1px +/**/2px)',
      'calc(1px/**/+/**/2px)',
    ]) {
      assert.deepEqual(reduceWithErrors(value), {
        output: 'calc(3px)',
        errors: [],
      });
    }
  });
});

describe('operators at range edges', () => {
  test('a trailing operator without following whitespace is rejected', () => {
    assertRejected(
      'calc(1px +)',
      '"+" must be surrounded by whitespace at position 9'
    );
  });

  test('a trailing operator with whitespace before the end is a missing operand', () => {
    assertRejected('calc(1px + )', 'Unexpected token "" at position 11');
  });

  test('an operator before a comma needs whitespace after it', () => {
    assertRejected(
      'min(1px +, 2px)',
      '"+" must be surrounded by whitespace at position 8'
    );
  });

  test('an operator at the end of a parenthesized group', () => {
    assertRejected(
      'calc((1px +) )',
      '"+" must be surrounded by whitespace at position 10'
    );
  });

  test('a leading operator is not a unary sign', () => {
    assertRejected('calc(+ 1px)', 'Unexpected token "+" at position 5');
  });

  test('a signed number directly after an operand is rejected', () => {
    assertRejected(
      'calc(1px+ 2px)',
      '"+" must be surrounded by whitespace at position 8'
    );
    assertRejected(
      'calc(1px -2px)',
      '"-" must be surrounded by whitespace at position 9'
    );
  });

  test('a double negative after an operator is a valid sign', () => {
    assert.deepEqual(reduceWithErrors('calc(1px - -2px)'), {
      output: 'calc(3px)',
      errors: [],
    });
  });
});

describe('unclosed functions', () => {
  test('a top-level unclosed calc() reports its position', () => {
    assertRejected('calc(1px + 2px', 'Unclosed calc( at position 0');
  });

  test('an unclosed calc() nested in a var() fallback reports the enclosing range', () => {
    assertRejected(
      'calc(1px + var(--a, calc(2px',
      'Unclosed calc( at position 0'
    );
  });

  test('an unclosed calc() after a reduced one reports its own position', () => {
    assert.deepEqual(reduceWithErrors('calc(1px + 1px) calc('), {
      output: 'calc(2px) calc(',
      errors: [['Unclosed calc( at position 16', 'calc(']],
    });
  });

  test('an unclosed var() is not a math function and stays silent', () => {
    assert.deepEqual(reduceWithErrors('var(--a, 1px'), {
      output: 'var(--a, 1px',
      errors: [],
    });
  });
});

const LIMIT = 1024;
const nestedParens = (n) => `calc(${'('.repeat(n)}1px${')'.repeat(n)})`;
const nestedFunctions = (n) =>
  `calc(${'unknown('.repeat(n)}1px${')'.repeat(n)})`;
const nestedSquares = (n) => `calc(var(--a, ${'['.repeat(n)}${']'.repeat(n)}))`;
const nestedCurlies = (n) => `calc(var(--a, ${'{'.repeat(n)}${'}'.repeat(n)}))`;
const nestedVarFunctions = (n) =>
  `calc(var(--a, ${'unknown('.repeat(n)}${')'.repeat(n)}))`;
const LIMIT_MESSAGE = `Calculation nesting exceeds the limit of ${LIMIT}`;

describe('nesting limit', () => {
  test('parentheses at the limit are accepted and past it are rejected', () => {
    assert.equal(reduceCalc(nestedParens(LIMIT - 1)), 'calc(1px)');
    assertRejected(nestedParens(LIMIT), LIMIT_MESSAGE);
  });

  test('functions at the limit are accepted and past it are rejected', () => {
    assert.deepEqual(reduceWithErrors(nestedFunctions(LIMIT - 1)).errors, []);
    assertRejected(nestedFunctions(LIMIT), LIMIT_MESSAGE);
  });

  test('functions inside a var() fallback count toward the limit', () => {
    assert.deepEqual(
      reduceWithErrors(nestedVarFunctions(LIMIT - 2)).errors,
      []
    );
    assert.deepEqual(reduceWithErrors(nestedVarFunctions(LIMIT - 1)).errors, [
      [LIMIT_MESSAGE, nestedVarFunctions(LIMIT - 1)],
    ]);
  });

  test('square brackets inside a var() fallback count toward the limit', () => {
    assert.deepEqual(reduceWithErrors(nestedSquares(LIMIT - 2)).errors, []);
    assert.deepEqual(reduceWithErrors(nestedSquares(LIMIT - 1)).errors, [
      [LIMIT_MESSAGE, nestedSquares(LIMIT - 1)],
    ]);
  });

  test('curly braces inside a var() fallback count toward the limit', () => {
    assert.deepEqual(reduceWithErrors(nestedCurlies(LIMIT - 2)).errors, []);
    assert.deepEqual(reduceWithErrors(nestedCurlies(LIMIT - 1)).errors, [
      [LIMIT_MESSAGE, nestedCurlies(LIMIT - 1)],
    ]);
  });

  test('parentheses inside a url() do not count', () => {
    const value = `calc(1px + 2px) url(${'('.repeat(3000)})`;
    assert.deepEqual(reduceWithErrors(value), {
      output: `calc(3px) url(${'('.repeat(3000)})`,
      errors: [],
    });
  });

  test('a bad url() does not count either', () => {
    const value = `calc(1px + 2px) url(a b${'('.repeat(3000)})`;
    assert.deepEqual(reduceWithErrors(value).errors, []);
  });

  test('a valid calc() beside over-limit nesting reports once and changes nothing', () => {
    const value = `calc(1px + 1px) x${'('.repeat(1100)}1px${')'.repeat(1100)}`;
    assertRejected(value, LIMIT_MESSAGE);
  });
});

describe('mismatched closers', () => {
  // A closer that does not match the innermost open block is ignored, so an
  // enclosing block can still be closed by a later closer.
  test('a closer that does not match leaves the calc() unclosed', () => {
    assertRejected('calc(1px + [2px)', 'Unclosed calc( at position 0');
  });

  test('a mismatched closer inside a fallback is ignored and the calc() reduces', () => {
    assert.deepEqual(reduceWithErrors('var(--a, calc(1px ) ] )'), {
      output: 'var(--a, calc(1px) ] )',
      errors: [],
    });
  });

  test('a mismatched closer inside a var() fallback is ignored', () => {
    assert.deepEqual(reduceWithErrors('calc(1px + var(--a, [b) 2px] ))'), {
      output: 'calc(1px + var(--a, [b) 2px] ))',
      errors: [],
    });
  });

  test('a mismatched closer that leaves the calc() open reports it unclosed', () => {
    assertRejected(
      'calc(1px + var(--a, [b)) 2px)',
      'Unclosed calc( at position 0'
    );
  });

  test('an unclosed block does not stop a later calc() from reducing', () => {
    assert.equal(
      reduceCalc('var(--a, [b) calc(1px + 2px)'),
      'var(--a, [b) calc(3px)'
    );
  });
});

describe('negated grouped sums with opaque terms', () => {
  test('a negated group with an opaque term keeps its grouping', () => {
    assert.deepEqual(reduceWithErrors('calc(-1 * (1px + var(--a)))'), {
      output: 'calc(-1 * (1px + var(--a)))',
      errors: [],
    });
  });

  test('a negated group keeps its opaque terms grouped after reduction', () => {
    assert.equal(
      reduceCalc('calc(-1 * (2px + 1px + var(--a)))'),
      'calc(-1 * (3px + var(--a)))'
    );
    assert.equal(
      reduceCalc('calc(-1 * (var(--a) + 2px))'),
      'calc(-1 * (2px + var(--a)))'
    );
  });
});

describe('diagnostic positions', () => {
  const cases = [
    ['calc(1px+ 2px)', '"+" must be surrounded by whitespace at position 8'],
    ['calc(1px 2px)', 'Unexpected token "2px" at position 9'],
    ['calc(1px + #)', 'Unexpected character "#" at position 11'],
    ['min(1px 2px)', 'Expected ) at position 8, got "2"'],
    ['calc(1px + var(1px))', 'Invalid custom property in var() at position 15'],
  ];
  for (const [value, message] of cases) {
    test(message, () => assertRejected(value, message));
  }
});
