// Behaviour the token-core refactor must keep: whitespace around operators,
// range edges, end-of-file tokens, unclosed blocks, nesting limits, negated
// opaque groups and diagnostic positions. Every case goes through the public
// string and token APIs.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '@csstools/css-tokenizer';
import reduceCalc from 'postcss-calc/reduce';
import reduceTokens from 'postcss-calc/reduce-tokens';
import { applyReplacements, raw } from '../helpers/reduce-list.js';

/** Run `reduceCalc` and collect each parse error as `[message, input]`. */
function reduceWithErrors(value, options = {}) {
  const errors = [];
  const output = reduceCalc(value, {
    ...options,
    onParseError: (error, input) => errors.push([error.message, input]),
  });
  return { output, errors };
}

/** Run `reduceTokens` on a list and return the edited text and errors. */
function reduceListWithErrors(tokens, options = {}) {
  const errors = [];
  const replacements = reduceTokens(tokens, {
    ...options,
    onParseError: (error, input) => errors.push([error.message, input]),
  });
  return { output: raw(applyReplacements(tokens, replacements)), errors };
}

/**
 * Tokenize `css` after a leading ident that is shortened to one character, so
 * the later tokens keep stale source offsets.
 */
function staleList(prefix, css) {
  const tokens = tokenize({ css: `${prefix} ${css}` });
  tokens[0] = tokenize({ css: 'a' })[0];
  return tokens;
}

describe('comments and whitespace around operators', () => {
  test('a comment counts as whitespace before and after an operator', () => {
    assert.deepEqual(reduceWithErrors('calc(1px/**/+ 2px)'), {
      output: 'calc(3px)',
      errors: [],
    });
    assert.deepEqual(reduceWithErrors('calc(1px +/**/2px)'), {
      output: 'calc(3px)',
      errors: [],
    });
    assert.deepEqual(reduceWithErrors('calc(1px/**/+/**/2px)'), {
      output: 'calc(3px)',
      errors: [],
    });
  });
});

describe('operators at range edges', () => {
  test('a trailing operator without following whitespace is rejected', () => {
    assert.deepEqual(reduceWithErrors('calc(1px +)'), {
      output: 'calc(1px +)',
      errors: [
        ['"+" must be surrounded by whitespace at position 9', 'calc(1px +)'],
      ],
    });
  });

  test('a trailing operator with whitespace before the end is a missing operand', () => {
    assert.deepEqual(reduceWithErrors('calc(1px + )'), {
      output: 'calc(1px + )',
      errors: [['Unexpected token "" at position 11', 'calc(1px + )']],
    });
  });

  test('an operator before a comma needs whitespace after it', () => {
    assert.deepEqual(reduceWithErrors('min(1px +, 2px)'), {
      output: 'min(1px +, 2px)',
      errors: [
        [
          '"+" must be surrounded by whitespace at position 8',
          'min(1px +, 2px)',
        ],
      ],
    });
  });

  test('an operator at the end of a parenthesized group', () => {
    assert.deepEqual(reduceWithErrors('calc((1px +) )'), {
      output: 'calc((1px +) )',
      errors: [
        [
          '"+" must be surrounded by whitespace at position 10',
          'calc((1px +) )',
        ],
      ],
    });
  });

  test('a leading operator is not a unary sign', () => {
    assert.deepEqual(reduceWithErrors('calc(+ 1px)'), {
      output: 'calc(+ 1px)',
      errors: [['Unexpected token "+" at position 5', 'calc(+ 1px)']],
    });
  });

  test('a signed number directly after an operand is rejected', () => {
    assert.deepEqual(reduceWithErrors('calc(1px+ 2px)'), {
      output: 'calc(1px+ 2px)',
      errors: [
        [
          '"+" must be surrounded by whitespace at position 8',
          'calc(1px+ 2px)',
        ],
      ],
    });
    assert.deepEqual(reduceWithErrors('calc(1px -2px)'), {
      output: 'calc(1px -2px)',
      errors: [
        [
          '"-" must be surrounded by whitespace at position 9',
          'calc(1px -2px)',
        ],
      ],
    });
  });

  test('a double negative after an operator is a valid sign', () => {
    assert.deepEqual(reduceWithErrors('calc(1px - -2px)'), {
      output: 'calc(3px)',
      errors: [],
    });
  });
});

describe('end-of-file tokens in a token list', () => {
  test('an end-of-file token directly after an operand breaks the whitespace rule', () => {
    const tokens = [
      ...tokenize({ css: 'calc(1px' }),
      ...tokenize({ css: '' }),
      ...tokenize({ css: '+ 2px)' }),
    ];
    assert.deepEqual(reduceListWithErrors(tokens), {
      output: 'calc(1px+ 2px)',
      errors: [
        [
          '"+" must be surrounded by whitespace at position 8',
          'calc(1px+ 2px)',
        ],
      ],
    });
  });

  test('an end-of-file token between whitespace and an operator is skipped', () => {
    const tokens = [
      ...tokenize({ css: 'calc(1px ' }),
      ...tokenize({ css: '' }),
      ...tokenize({ css: '+ 2px)' }),
    ];
    assert.deepEqual(reduceListWithErrors(tokens), {
      output: 'calc(3px)',
      errors: [],
    });
  });

  test('an end-of-file token inside a var() fallback is skipped', () => {
    const tokens = [
      ...tokenize({ css: 'calc(1px + var(--a,' }),
      ...tokenize({ css: '' }),
      ...tokenize({ css: ' 2px))' }),
    ];
    assert.deepEqual(reduceListWithErrors(tokens), {
      output: 'calc(1px + var(--a, 2px))',
      errors: [],
    });
  });
});

describe('unclosed functions', () => {
  test('a top-level unclosed calc() reports its position', () => {
    assert.deepEqual(reduceWithErrors('calc(1px + 2px'), {
      output: 'calc(1px + 2px',
      errors: [['Unclosed calc( at position 0', 'calc(1px + 2px']],
    });
  });

  test('an unclosed calc() nested in a var() fallback reports the enclosing range', () => {
    assert.deepEqual(reduceWithErrors('calc(1px + var(--a, calc(2px'), {
      output: 'calc(1px + var(--a, calc(2px',
      errors: [
        ['Unclosed calc( at position 0', 'calc(1px + var(--a, calc(2px'],
      ],
    });
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

  test('an unclosed calc() in a token list reports its position in the list', () => {
    const errors = [];
    const tokens = staleList('aaaaaaaaaa', 'calc(1px');
    reduceTokens(tokens, {
      onParseError: (error, input) => errors.push([error.message, input]),
    });
    assert.deepEqual(errors, [['Unclosed calc( at position 2', 'calc(1px']]);
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
    // `calc(` plus 1023 parentheses is 1024 openers in total.
    assert.equal(reduceCalc(nestedParens(LIMIT - 1)), 'calc(1px)');
    const { output, errors } = reduceWithErrors(nestedParens(LIMIT));
    assert.equal(output, nestedParens(LIMIT));
    assert.deepEqual(errors, [[LIMIT_MESSAGE, nestedParens(LIMIT)]]);
  });

  test('functions at the limit are accepted and past it are rejected', () => {
    assert.deepEqual(reduceWithErrors(nestedFunctions(LIMIT - 1)).errors, []);
    const { output, errors } = reduceWithErrors(nestedFunctions(LIMIT));
    assert.equal(output, nestedFunctions(LIMIT));
    assert.deepEqual(errors, [[LIMIT_MESSAGE, nestedFunctions(LIMIT)]]);
  });

  test('functions inside a var() fallback count toward the limit', () => {
    // `calc(` and `var(` plus 1022 functions is 1024 openers in total.
    assert.deepEqual(
      reduceWithErrors(nestedVarFunctions(LIMIT - 2)).errors,
      []
    );
    const { errors } = reduceWithErrors(nestedVarFunctions(LIMIT - 1));
    assert.deepEqual(errors, [[LIMIT_MESSAGE, nestedVarFunctions(LIMIT - 1)]]);
  });

  test('square brackets inside a var() fallback count toward the limit', () => {
    assert.deepEqual(reduceWithErrors(nestedSquares(LIMIT - 2)).errors, []);
    const { errors } = reduceWithErrors(nestedSquares(LIMIT - 1));
    assert.deepEqual(errors, [[LIMIT_MESSAGE, nestedSquares(LIMIT - 1)]]);
  });

  test('curly braces inside a var() fallback count toward the limit', () => {
    assert.deepEqual(reduceWithErrors(nestedCurlies(LIMIT - 2)).errors, []);
    const { errors } = reduceWithErrors(nestedCurlies(LIMIT - 1));
    assert.deepEqual(errors, [[LIMIT_MESSAGE, nestedCurlies(LIMIT - 1)]]);
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

  test('a list with a valid calc() and over-limit nesting outside it reports once and changes nothing', () => {
    const value = `calc(1px + 1px) x${'('.repeat(1100)}1px${')'.repeat(1100)}`;
    const { output, errors } = reduceWithErrors(value);
    assert.equal(output, value);
    assert.deepEqual(errors, [[LIMIT_MESSAGE, value]]);
  });

  test('the limit error on a token list reports the whole list text', () => {
    const css = `calc(1px${'('.repeat(1100)}1px${')'.repeat(1100)})`;
    const tokens = staleList('aaaaaaaaaa', css);
    const errors = [];
    reduceTokens(tokens, {
      onParseError: (error, input) => errors.push([error.message, input]),
    });
    assert.deepEqual(errors, [[LIMIT_MESSAGE, `a ${css}`]]);
  });
});

describe('mismatched closers', () => {
  // A closer that does not match the innermost open block is ignored, so an
  // enclosing block can still be closed by a later closer.
  test('a mismatched closer inside a var() fallback is ignored', () => {
    assert.deepEqual(reduceWithErrors('calc(1px + var(--a, [b) 2px] ))'), {
      output: 'calc(1px + var(--a, [b) 2px] ))',
      errors: [],
    });
  });

  test('a mismatched closer that leaves the calc() open reports it unclosed', () => {
    assert.deepEqual(reduceWithErrors('calc(1px + var(--a, [b)) 2px)'), {
      output: 'calc(1px + var(--a, [b)) 2px)',
      errors: [
        ['Unclosed calc( at position 0', 'calc(1px + var(--a, [b)) 2px)'],
      ],
    });
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

describe('diagnostic positions on edited token lists', () => {
  // Each case shortens the leading ident after tokenizing, so later tokens
  // keep offsets from the longer text. Positions must count the current text,
  // which here is `a ${css}`.
  const cases = [
    {
      name: 'whitespace after an operator',
      css: 'calc(1px+ 2px)',
      message: '"+" must be surrounded by whitespace at position 10',
    },
    {
      name: 'unexpected token',
      css: 'calc(1px 2px)',
      message: 'Unexpected token "2px" at position 11',
    },
    {
      name: 'unexpected character',
      css: 'calc(1px + #)',
      message: 'Unexpected character "#" at position 13',
    },
    {
      name: 'missing closing parenthesis',
      css: 'min(1px 2px)',
      message: 'Expected ) at position 10, got "2"',
    },
    {
      name: 'unclosed calc()',
      css: 'calc((1px + 2px)',
      message: 'Unclosed calc( at position 2',
    },
    {
      name: 'invalid custom property',
      css: 'calc(1px + var(1px))',
      message: 'Invalid custom property in var() at position 17',
    },
  ];
  for (const { name, css, message } of cases) {
    test(name, () => {
      const errors = [];
      reduceTokens(staleList('aaaaaaaaaa', css), {
        onParseError: (error, input) => errors.push([error.message, input]),
      });
      assert.deepEqual(errors, [[message, css]]);
    });
  }
});
