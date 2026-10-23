// Token-list reducer: same results as the string reducer, and no dependence
// on the source offsets stored in the tokens.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tokenize, TokenType } from '@csstools/css-tokenizer';
import reduceCalc from 'postcss-calc/reduce';
import reduceTokens, {
  hasPotentialMathFunction,
} from 'postcss-calc/reduce-tokens';
import { applyReplacements, raw } from '../helpers/reduce-list.js';

const fullCorpus = process.env.POSTCSS_CALC_FULL_CORPUS === '1';

const values = [
  'calc(1px + 2px)',
  'calc(1px + 2px) calc(3 * 4)',
  'margin calc(100% - 10px) calc(2 * var(--a))',
  'min(1px, 2px) max(3px, 4em)',
  'calc(1px + (2 * 3px))',
  'CALC(1PX + 2PX)',
  '-webkit-calc(1px + 2px)',
  'calc(var(--a) + calc(1px + 2px))',
  'calc(1px +',
  'calc(1px + 2)',
  'calc(1 / 3)',
  'translate(calc(1px + 2px), calc(2 * 50%))',
  'url(calc(1+2)) calc(1px + 1px)',
  'calc(1px + 2px)calc(3px + 4px)',
  'calc(1px+2px)',
  'nothing to see',
];

describe('reduceTokens: equals reduceCalc', () => {
  for (const value of values) {
    test(value, () => {
      const tokens = tokenize({ css: value });
      assert.equal(
        raw(applyReplacements(tokens, reduceTokens(tokens))),
        reduceCalc(value)
      );
    });
  }

  test('options', () => {
    const value = 'calc(1.23456px + 1px) calc(1 - 2) calc(1 / 3)';
    const tokens = tokenize({ css: value });
    for (const options of [
      { precision: 2 },
      { precision: false },
      { unwrapSingleValue: true },
      { unwrapSingleNegativeNumber: true },
    ]) {
      assert.equal(
        raw(applyReplacements(tokens, reduceTokens(tokens, options))),
        reduceCalc(value, options)
      );
    }
  });

  test('corpus', () => {
    const lines = readFileSync(
      new URL('../corpus/github-pure.txt', import.meta.url),
      'utf8'
    )
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .slice(0, fullCorpus ? undefined : 2000);
    for (const line of lines) {
      const tokens = tokenize({ css: line });
      assert.equal(
        raw(applyReplacements(tokens, reduceTokens(tokens))),
        reduceCalc(line)
      );
    }
  });
});

describe('reduceTokens: replacements', () => {
  test('are ordered token ranges that change the text', () => {
    const tokens = tokenize({ css: 'calc(1px + 2px) 3px calc(2px)' });
    const replacements = reduceTokens(tokens);
    assert.equal(replacements.length, 1);
    assert.equal(replacements[0].start, 0);
    assert.equal(raw(tokens.slice(0, replacements[0].end)), 'calc(1px + 2px)');
    assert.equal(raw(replacements[0].tokens), 'calc(3px)');
  });

  test('replacement tokens are what tokenizing their text gives', () => {
    const [replacement] = reduceTokens(tokenize({ css: 'calc(1px + 2px)' }));
    assert.deepEqual(
      replacement.tokens.map((token) => token.slice(0, 2)),
      tokenize({ css: 'calc(3px)' })
        .slice(0, -1)
        .map((token) => token.slice(0, 2))
    );
  });

  test('unchanged input gives no replacements', () => {
    assert.deepEqual(reduceTokens(tokenize({ css: 'calc(2px)' })), []);
    assert.deepEqual(reduceTokens(tokenize({ css: '1px solid red' })), []);
  });

  test('values without a math function skip the nesting check', () => {
    const errors = [];
    const replacements = reduceTokens(tokenize({ css: '('.repeat(5000) }), {
      onParseError: (error) => errors.push(error),
    });
    assert.deepEqual(replacements, []);
    assert.deepEqual(errors, []);
  });

  test('a calculation past the nesting limit still reports', () => {
    const errors = [];
    const css = `calc(${'('.repeat(2000)}1px${')'.repeat(2000)})`;
    reduceTokens(tokenize({ css }), {
      onParseError: (error) => errors.push(error.message),
    });
    assert.deepEqual(errors, ['Calculation nesting exceeds the limit of 1024']);
  });

  test('reduceCalc skips the nesting check without a math function token', () => {
    const errors = [];
    const value = 'url(calc(1+2))' + '('.repeat(3000);
    assert.equal(
      reduceCalc(value, { onParseError: (error) => errors.push(error) }),
      value
    );
    assert.deepEqual(errors, []);
  });

  test('does not modify the token list', () => {
    const tokens = tokenize({ css: 'calc(1px + 2px)' });
    const before = JSON.stringify(tokens);
    reduceTokens(tokens);
    assert.equal(JSON.stringify(tokens), before);
  });
});

describe('reduceTokens: edited token lists', () => {
  test('ignores stale source offsets after an earlier edit', () => {
    const tokens = tokenize({
      css: 'aaaaaaaaaa calc(1px + 2px) bb calc(3px * 2)',
    });
    // Shorten the leading ident without touching offsets, as a reducer would.
    tokens[0] = tokenize({ css: 'a' })[0];
    assert.equal(
      raw(applyReplacements(tokens, reduceTokens(tokens))),
      'a calc(3px) bb calc(6px)'
    );
  });

  test('ignores stale offsets inside the expression', () => {
    const tokens = tokenize({ css: 'calc(1px  +    2px)' });
    const whitespace = tokens.filter((token) => token[1].startsWith(' '));
    for (const token of whitespace) token[1] = ' ';
    assert.equal(
      raw(applyReplacements(tokens, reduceTokens(tokens))),
      'calc(3px)'
    );
  });

  test('inserted tokens take part', () => {
    const tokens = tokenize({ css: 'calc(1px + X)' });
    const index = tokens.findIndex((token) => token[1] === 'X');
    tokens.splice(index, 1, ...tokenize({ css: '2px' }).slice(0, -1));
    assert.equal(
      raw(applyReplacements(tokens, reduceTokens(tokens))),
      'calc(3px)'
    );
  });

  test('reports positions in the current text', () => {
    const errors = [];
    const tokens = tokenize({ css: 'aaaaaaaaaa calc(1px + )' });
    tokens[0] = tokenize({ css: 'a' })[0];
    reduceTokens(tokens, {
      onParseError: (error, input) => errors.push([error.message, input]),
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0][1], 'calc(1px + )');
    assert.equal(errors[0][0], 'Unexpected token "" at position 13');
  });

  test('unclosed calculations report positions in the current text', () => {
    const errors = [];
    const tokens = tokenize({ css: 'aaaaaaaaaa calc(1px +' });
    tokens[0] = tokenize({ css: 'a' })[0];
    reduceTokens(tokens, {
      onParseError: (error, input) => errors.push([error.message, input]),
    });
    assert.deepEqual(errors, [['Unclosed calc( at position 2', 'calc(1px +']]);
  });

  test('invalid custom properties report positions in the current text', () => {
    const errors = [];
    const tokens = tokenize({ css: 'aaaaaaaaaa calc(1px + var(1px))' });
    tokens[0] = tokenize({ css: 'a' })[0];
    reduceTokens(tokens, {
      onParseError: (error, input) => errors.push([error.message, input]),
    });
    assert.deepEqual(errors, [
      [
        'Invalid custom property in var() at position 17',
        'calc(1px + var(1px))',
      ],
    ]);
  });

  test('token lists without a trailing EOF token reduce the same', () => {
    for (const value of values) {
      const tokens = tokenize({ css: value });
      if (tokens.at(-1)[0] === TokenType.EOF) tokens.pop();
      assert.equal(
        raw(applyReplacements(tokens, reduceTokens(tokens))),
        reduceCalc(value)
      );
    }
  });

  test('unclosed calculations without a trailing EOF token report', () => {
    const errors = [];
    const tokens = tokenize({ css: 'calc(1px +' });
    tokens.pop();
    reduceTokens(tokens, {
      onParseError: (error, input) => errors.push([error.message, input]),
    });
    assert.deepEqual(errors, [['Unclosed calc( at position 0', 'calc(1px +']]);
  });

  test('warnings carry the current text', () => {
    const warnings = [];
    const tokens = tokenize({ css: 'xxxx calc(100% - var(--a))' });
    tokens[0] = tokenize({ css: 'x' })[0];
    reduceTokens(tokens, {
      warnWhenCannotResolve: true,
      onWarn: (message) => warnings.push(message),
    });
    assert.deepEqual(warnings, [
      'Could not reduce expression: x calc(100% - var(--a))',
    ]);
  });

  test('all parse errors report positions in the current text', () => {
    const cases = [
      ['calc(1px+ 2px)', '"+" must be surrounded by whitespace at position 6'],
      ['calc(1px 2px)', 'Unexpected token "2px" at position 9'],
      ['calc((1px + 2px)', 'Unclosed calc( at position 0'],
      ['calc(1px + #)', 'Unexpected character "#" at position 11'],
    ];
    for (const [css, message] of cases) {
      const errors = [];
      const tokens = tokenize({ css: `aaaaaaaaaa ${css}` });
      tokens[0] = tokenize({ css: 'a' })[0];
      reduceTokens(tokens, {
        onParseError: (error) => errors.push(error.message),
      });
      assert.equal(errors.length, 1, css);
      assert.ok(
        errors[0].startsWith(message.split(' at position')[0]),
        `${css}: ${errors[0]}`
      );
    }
  });

  test('end-of-file tokens inside the list are skipped', () => {
    const tokens = [
      ...tokenize({ css: 'calc(1px +' }),
      ...tokenize({ css: ' 2px)' }),
    ];
    assert.equal(
      raw(applyReplacements(tokens, reduceTokens(tokens))),
      'calc(3px)'
    );
  });

  test('lists joined from whole-token pieces match reduceCalc', () => {
    const pieces = [
      ['a ', 'calc(1px', ' + ', '2px)', ' b'],
      ['calc(', '1px * ', '2', ')calc(3px+', ' 1px)'],
      ['min(1px, ', '2px) ', 'max(3px,', ' var(--a))'],
    ];
    for (const parts of pieces) {
      const tokens = parts.flatMap((part) => tokenize({ css: part }));
      assert.equal(
        raw(applyReplacements(tokens, reduceTokens(tokens))),
        reduceCalc(raw(tokens)),
        raw(tokens)
      );
    }
  });
});

describe('reduceTokens: concatenated token lists', () => {
  test('an end-of-file token inside var() is skipped', () => {
    const tokens = [
      ...tokenize({ css: 'calc(1px + var(' }),
      ...tokenize({ css: '--a))' }),
    ];
    assert.equal(
      raw(applyReplacements(tokens, reduceTokens(tokens))),
      reduceCalc('calc(1px + var(--a))')
    );
  });
});

describe('hasPotentialMathFunction', () => {
  test('is true for values reduceTokens can change', () => {
    for (const value of values) {
      const tokens = tokenize({ css: value });
      if (reduceTokens(tokens).length > 0) {
        assert.equal(hasPotentialMathFunction(value), true, value);
      }
    }
  });

  test('is false for values without a math function', () => {
    assert.equal(hasPotentialMathFunction('1px solid red'), false);
    assert.equal(hasPotentialMathFunction('rgb(255, 0, 0)'), false);
  });
});

describe('reduceTokens: a range of the list', () => {
  test('reports replacements at indices of the whole list', () => {
    const tokens = tokenize({ css: 'calc(1px + 2px) calc(3px + 4px)' });
    const second = tokens.findLastIndex(
      (token) => token[0] === TokenType.Function
    );
    const replacements = reduceTokens(tokens, {}, second, tokens.length);
    assert.equal(replacements.length, 1);
    assert.equal(replacements[0].start, second);
    assert.equal(replacements[0].end, tokens.length - 1);
    assert.equal(
      raw(applyReplacements(tokens, replacements)),
      'calc(1px + 2px) calc(7px)'
    );
  });

  test('ignores the tokens outside its range', () => {
    const tokens = tokenize({ css: 'calc(1px + 2px) calc(3px + 4px)' });
    assert.deepEqual(
      reduceTokens(tokens, {}, 0, 2),
      reduceTokens(tokens.slice(0, 2))
    );
  });

  test('reports the same errors, at the same positions, as the slice it replaces', () => {
    const tokens = tokenize({ css: 'x calc(1px + [2px) y' });
    const errors = [];
    const sliceErrors = [];
    const onParseError = (error, input) => errors.push([error.message, input]);
    reduceTokens(tokens, { onParseError }, 2, tokens.length);
    reduceTokens(tokens.slice(2), {
      onParseError: (error, input) => sliceErrors.push([error.message, input]),
    });
    assert.deepEqual(errors, sliceErrors);
  });
});
