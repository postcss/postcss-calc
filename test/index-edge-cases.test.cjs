'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const postcss = require('postcss');
const reduceCalc = (opts = {}) => require('../src/index.js')(opts);
const { testValue } = require('./helpers/testValue.js');

const postcssOpts = { from: undefined };

function testCssDoesNotThrow(fixture, expected, opts = {}) {
  return async () => {
    const result = await postcss(reduceCalc(opts)).process(
      fixture,
      postcssOpts
    );
    assert.strictEqual(result.css, expected);
    const warnings = result.warnings();
    assert.strictEqual(warnings.length, 0);
  };
}
describe('Throw', () => {
  test(
    'should not throw an exception when unknow function exist in calc',
    testValue(
      'calc(unknown(#fff) - other-unknown(200px))',
      'calc(unknown(#fff) - other-unknown(200px))'
    )
  );

  test(
    'should not throw an exception when unknow function exist in calc (#1)',
    // spec-style spaces around `*`.
    testValue(
      'calc(unknown(#fff) * other-unknown(200px))',
      'calc(unknown(#fff) * other-unknown(200px))'
    )
  );
});

describe('Custom properties', () => {
  test(
    'should not strip calc with single CSS custom variable',
    // single-value calc() unwrapped (§10.6).
    testValue('calc(var(--foo))', 'var(--foo)')
  );

  test(
    'should strip unnecessary calc with single CSS custom variable',
    // nested calc() flattens, then single-value unwrap.
    testValue('calc(calc(var(--foo)))', 'var(--foo)')
  );

  test(
    'should not strip calc with single CSS custom variables and value',
    // canonical order: dim before opaque var().
    testValue(
      'calc(var(--foo) + 10px)',
      /* 'calc(var(--foo) + 10px)' */ 'calc(10px + var(--foo))'
    )
  );
});

// unit case lowercased.
test(
  'should reduce calc (uppercase)',
  testValue('CALC(1PX + 1PX)', /* '2PX' */ '2px')
);

describe('Reduce', () => {
  test(
    'should reduce calc (uppercase) (#1)',
    testValue('CALC(VAR(--foo) + VAR(--bar))', 'CALC(VAR(--foo) + VAR(--bar))')
  );

  test(
    'should reduce calc (uppercase) (#2)',
    // zero bucket kept → calc() wrapper survives (name case preserved).
    testValue('CALC( (1EM - CALC( 10PX + 1EM)) / 2)', 'CALC(0em - 5px)')
  );
});

test(
  'should preserve calc when extra parentheses are used',
  // spec-style spaces around `/`.
  testValue(
    'calc((var(--circumference) / var(--number-of-segments)))',
    'calc(var(--circumference) / var(--number-of-segments))'
  )
);

describe('Whitespace', () => {
  test('whitespace', testValue('calc( 100px + 100px )', '200px'));

  test('whitespace (#1)', testValue('calc(\t100px\t+\t100px\t)', '200px'));

  test('whitespace (#2)', testValue('calc(\n100px\n+\n100px\n)', '200px'));

  test(
    'whitespace (#4)',
    testValue('calc(\r\n100px\r\n+\r\n100px\r\n)', '200px')
  );
});

describe('Comments', () => {
  test(
    'comments',
    testValue('calc(/*test*/100px/*test*/ + /*test*/100px/*test*/)', '200px')
  );

  test(
    'comments (#1)',
    testValue('calc(/*test*/100px/*test*/*/*test*/2/*test*/)', '200px')
  );

  test(
    'comments nested',
    testValue(
      'calc(/*test*/100px + calc(/*test*/100px/*test*/ + /*test*/100px/*test*/))',
      '300px'
    )
  );
});

test(
  'calc-size should be ignored',
  testCssDoesNotThrow(
    '.foo{block-size: calc-size(auto, size)}',
    '.foo{block-size: calc-size(auto, size)}'
  )
);

test(
  'error with parsing',
  // unrecognized identifier left opaque; previously threw a lex error.
  testValue('calc(10pc + unknown)', 'calc(10pc + unknown)')
);
