'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const postcss = require('postcss');
const reduceCalc = (opts = {}) => require('../src/index.js')(opts);
const { testValue } = require('./helpers/testValue.test.js');

const postcssOpts = { from: undefined };

function testCss(fixture, expected, opts = {}) {
  return async () => {
    const result = await postcss(reduceCalc(opts)).process(
      fixture,
      postcssOpts
    );
    assert.strictEqual(result.css, expected);
  };
}

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

describe('Reduce', () => {
  test('should reduce simple calc (1)', testValue('calc(1px + 1px)', '2px'));
  test(
    'should reduce simple calc (2)',
    // `2px+3px` violates §10.1 whitespace → preserved with a warning.
    testValue(
      'calc(1px + 1px);baz:calc(2px+3px)',
      /* '2px;baz:5px' */ '2px;baz:calc(2px+3px)'
    )
  );

  test(
    'should reduce simple calc (3)',
    testValue('calc(1rem * 1.5)', '1.5rem')
  );

  test('should reduce simple calc (4)', testValue('calc(3em - 1em)', '2em'));

  test('should reduce simple calc (5', testValue('calc(2ex / 2)', '1ex'));

  test(
    'should reduce simple calc (6)',
    testValue('calc(50px - (20px - 30px))', '60px')
  );

  test(
    'should reduce simple calc (7)',
    // zero bucket kept for type info (WPT calc-serialization-002).
    testValue('calc(100px - (100px - 100%))', /* '100%' */ 'calc(0px + 100%)')
  );

  test(
    'should reduce simple calc (8)',
    testValue('calc(100px + (100px - 100%))', 'calc(200px - 100%)')
  );

  test(
    'should reduce additions and subtractions (1)',
    testValue('calc(100% - 10px + 20px)', 'calc(100% + 10px)')
  );

  test(
    'should reduce additions and subtractions (2)',
    testValue('calc(100% + 10px - 20px)', 'calc(100% - 10px)')
  );

  test(
    'should reduce additions and subtractions (3)',
    testValue('calc(1px - (2em + 3%))', 'calc(1px - 2em - 3%)')
  );

  test(
    'should reduce additions and subtractions (4)',
    testValue('calc((100vw - 50em) / 2)', 'calc(50vw - 25em)')
  );

  test(
    'should reduce additions and subtractions (5)',
    testValue('calc(10px - (100vw - 50em) / 2)', 'calc(10px - 50vw + 25em)')
  );

  test(
    'should reduce additions and subtractions (6)',
    testValue('calc(1px - (2em + 4vh + 3%))', 'calc(1px - 2em - 4vh - 3%)')
  );

  test(
    'should reduce additions and subtractions (7)',
    // reciprocal + canonical coefficient-first order.
    testValue(
      'calc(0px - (24px - (var(--a) - var(--b)) / 2 + var(--c)))',
      'calc(0px - (24px - .5 * (var(--a) - var(--b)) + var(--c)))'
    )
  );

  test(
    'should reduce additions and subtractions (8)',
    testValue('calc(1px + (2em + (3vh + 4px)))', 'calc(5px + 2em + 3vh)')
  );

  test(
    'should reduce additions and subtractions (9)',
    testValue('calc(1px - (2em + 4px - 6vh) / 2)', 'calc(-1px - 1em + 3vh)')
  );

  test(
    'should reduce multiplication',
    // constant fold `2*2 → 4`; coefficient first.
    testValue('calc(((var(--a) + 4px) * 2) * 2)', 'calc(4 * (4px + var(--a)))')
  );

  test(
    'should reduce multiplication before reducing additions',
    // constant fold `2*2 → 4`; canonical order.
    testValue(
      'calc(((var(--a) + 4px) * 2) * 2 + 4px)',
      'calc(4px + 4 * (4px + var(--a)))'
    )
  );

  test(
    'should reduce division',
    // constant fold `1/2/2 → .25` + reciprocal; coefficient first.
    testValue(
      'calc(((var(--a) + 4px) / 2) / 2)',
      'calc(.25 * (4px + var(--a)))'
    )
  );

  test(
    'should reduce division before reducing additions',
    // constant fold + reciprocal; canonical order.
    testValue(
      'calc(((var(--a) + 4px) / 2) / 2 + 4px)',
      'calc(4px + .25 * (4px + var(--a)))'
    )
  );
});

describe('Ignore', () => {
  test(
    'should ignore value surrounding calc function (1)',
    testValue('a calc(1px + 1px)', 'a 2px')
  );

  test(
    'should ignore value surrounding calc function (2)',
    testValue('calc(1px + 1px) a', '2px a')
  );

  test(
    'should ignore value surrounding calc function (3)',
    testValue('a calc(1px + 1px) b', 'a 2px b')
  );

  test(
    'should ignore value surrounding calc function (4)',
    testValue('a calc(1px + 1px) b calc(1em + 2em) c', 'a 2px b 3em c')
  );
});

describe('Reduce', () => {
  test('should reduce uppercase calc (1)', testValue('CALC(1px + 1px)', '2px'));

  test(
    'should reduce uppercase calc (2)',
    testValue('CALC(1px + CALC(2px / 2))', '2px')
  );

  test(
    'should reduce uppercase calc (3)',
    testValue('-WEBKIT-CALC(1px + 1px)', '2px')
  );

  test(
    'should reduce uppercase calc (4)',
    testValue('-WEBKIT-CALC(1px + -WEBKIT-CALC(2px / 2))', '2px')
  );
});

describe('CSS custom properties', () => {
  test(
    'should ignore calc with css variables (1)',
    // spec-style spaces; canonical order puts the dim first.
    testValue(
      'calc(var(--mouseX) * 1px)',
      /* 'calc(var(--mouseX)*1px)' */ 'calc(1px * var(--mouseX))'
    )
  );

  test(
    'should ignore calc with css variables (2)',
    // spec-style spaces around `*`.
    testValue(
      'calc(10px - (100px * var(--mouseX)))',
      /* 'calc(10px - 100px*var(--mouseX))' */ 'calc(10px - 100px * var(--mouseX))'
    )
  );

  test(
    'should ignore calc with css variables (3)',
    testValue(
      'calc(10px - (100px + var(--mouseX)))',
      'calc(10px - (100px + var(--mouseX)))'
    )
  );

  test(
    'should ignore calc with css variables (4)',
    // spec-style spaces around `/`.
    testValue(
      'calc(10px - (100px / var(--mouseX)))',
      /* 'calc(10px - 100px/var(--mouseX))' */ 'calc(10px - 100px / var(--mouseX))'
    )
  );

  test(
    'should ignore calc with css variables (5)',
    testValue(
      'calc(10px - (100px - var(--mouseX)))',
      'calc(10px - (100px - var(--mouseX)))'
    )
  );

  test(
    'should ignore calc with css variables (6)',
    // `/2` → `* .5` (reciprocal); coefficient first.
    testValue(
      'calc(var(--popupHeight) / 2)',
      /* 'calc(var(--popupHeight)/2)' */ 'calc(.5 * var(--popupHeight))'
    )
  );

  test(
    'should ignore calc with css variables (7)',
    // `/2` → `* .5` on both terms; coefficient first.
    testValue(
      'calc(var(--popupHeight) / 2 + var(--popupWidth) / 2)',
      'calc(.5 * var(--popupHeight) + .5 * var(--popupWidth))'
    )
  );

  test(
    'should preserve escapes inside custom property identifiers',
    testValue(
      '.a { margin: calc(-1 * var(--kendo-spacing-1\\.5, .375rem)); }',
      '.a { margin: calc(-1 * var(--kendo-spacing-1\\.5, .375rem)); }'
    )
  );
});

test(
  'should reduce calc with newline characters',
  testValue('calc(\n1rem \n* 2 \n* 1.5)', '3rem')
);

test(
  'should parse fractions without leading zero',
  testValue('calc(2rem - .14285em)', 'calc(2rem - .14285em)')
);

describe('Precision', () => {
  test(
    'should handle precision correctly (1)',
    testValue('calc(1/100)', '.01')
  );

  test(
    'should handle precision correctly (2)',
    testValue('calc(5/1000000)', '.00001')
  );

  test(
    'should handle precision correctly (3)',
    testValue('calc(5/1000000)', '.000005', { precision: 6 })
  );

  test(
    'should keep a value smaller than the precision instead of rounding it to zero',
    testValue('calc(1/1000000)', '.000001')
  );

  test(
    'should keep a dimension smaller than the precision',
    testValue('calc(1px/1000000)', '.000001px')
  );

  test(
    'should keep a negative value smaller than the precision',
    testValue('calc(-1/1000000)', 'calc(-.000001)')
  );

  test(
    'should keep the ratio between two values smaller than the precision',
    testValue('calc(2/1000000)', '.000002')
  );

  test(
    'should limit a value smaller than the precision to that many significant digits',
    testValue('calc(1/3000000)', '3.3333e-7')
  );

  test(
    'should still round float noise down to zero',
    testValue('calc(0.1px + 0.2px - 0.3px)', '0px')
  );

  test(
    'should fold exact cancellation with large operands to zero, not a phantom',
    testValue('calc(0.07px * 1e7 - 700000px)', '0px')
  );
});

describe('Browser prefixes', () => {
  test(
    'should reduce browser-prefixed calc (1)',
    testValue('-webkit-calc(1px + 1px)', '2px')
  );

  test(
    'should reduce browser-prefixed calc (2)',
    testValue('-moz-calc(1px + 1px)', '2px')
  );
});

describe('Skip special functions', () => {
  test(
    'should skip constant function',
    // single-value calc() unwrapped (§10.6).
    testValue(
      'calc(constant(safe-area-inset-left))',
      /* 'calc(constant(safe-area-inset-left))' */ 'constant(safe-area-inset-left)'
    )
  );

  test(
    'should skip env function',
    // single-value calc() unwrapped (§10.6).
    testValue(
      'calc(env(safe-area-inset-left))',
      /* 'calc(env(safe-area-inset-left))' */ 'env(safe-area-inset-left)'
    )
  );

  test(
    'should skip env function (#1)',
    testValue(
      'calc(env(safe-area-inset-left, 50px 20px))',
      'calc(env(safe-area-inset-left, 50px 20px))'
    )
  );

  test(
    'should skip unknown function',
    // single-value calc() unwrapped (§10.6).
    testValue(
      'calc(unknown(safe-area-inset-left))',
      /* 'calc(unknown(safe-area-inset-left))' */ 'unknown(safe-area-inset-left)'
    )
  );
});

test(
  'should not yield warnings when nothing is wrong',
  testValue('calc(500px - 0px)', '500px', { warnWhenCannotResolve: true })
);

test(
  'should warn when calc expression cannot be reduced to a single value',
  testValue('calc(100% + 1px)', 'calc(100% + 1px)', {
    warnWhenCannotResolve: true,
  })
);

test(
  'should not parse variables as calc expressions (#35)',
  testCss(
    'foo:nth-child(2n + $var-calc){}',
    'foo:nth-child(2n + $var-calc){}',
    { selectors: true }
  )
);

test(
  'should apply algebraic reduction (cssnano#319)',
  // zero bucket kept for type info.
  testValue(
    'calc((100px - 1em) + (-50px + 1em))',
    /* '50px' */ 'calc(50px + 0em)'
  )
);

describe('Discard zero values', () => {
  test(
    'should discard zero values (reduce-css-calc#2) (1)',
    testValue('calc(100vw / 2 - 6px + 0px)', 'calc(50vw - 6px)')
  );

  test(
    'should discard zero values (reduce-css-calc#2) (2)',
    testValue('calc(500px - 0px)', '500px')
  );
});

test(
  'should return the same and not thrown an exception for attribute selectors without a value',
  testCss('button[disabled]{}', 'button[disabled]{}', { selectors: true })
);

describe('Ignore', () => {
  test(
    'should ignore reducing custom property',
    // `/8` → `* .125` (reciprocal); coefficient first.
    testCss(
      ':root { --foo: calc(var(--bar) / 8); }',
      /* ':root { --foo: calc(var(--bar)/8); }' */ ':root { --foo: calc(.125 * var(--bar)); }'
    )
  );

  test(
    'should ignore media queries',
    testCss(
      '@media (min-width:calc(10px+10px)){}',
      '@media (min-width:calc(10px+10px)){}'
    )
  );
});

test(
  'should reduce calc in media queries when `mediaQueries` option is set to true',
  // `10px+10px` violates §10.1 whitespace → preserved with a warning.
  testCss(
    '@media (min-width:calc(10px+10px)){}',
    /* '@media (min-width:20px){}' */ '@media (min-width:calc(10px+10px)){}',
    {
      mediaQueries: true,
    }
  )
);

describe('Ignore', () => {
  test(
    'should ignore selectors (1)',
    testCss('div[data-size="calc(3*3)"]{}', 'div[data-size="calc(3*3)"]{}')
  );

  test(
    'should ignore selectors (2)',
    testCss(
      'div:nth-child(2n + calc(3*3)){}',
      'div:nth-child(2n + calc(3*3)){}'
    )
  );
});

test(
  'should not touch calc() inside attribute-value strings (matching is literal)',
  testCss('div[data-size="calc(3*3)"]{}', 'div[data-size="calc(3*3)"]{}', {
    selectors: true,
  })
);

describe('Reduce', () => {
  test(
    'should reduce calc in selectors when `selectors` option is set to true (2)',
    testCss('div:nth-child(2n + calc(3*3)){}', 'div:nth-child(2n + 9){}', {
      selectors: true,
    })
  );

  test(
    'should not reduce 100% to 1 (reduce-css-calc#44)',
    testCss(
      '.@supports (width:calc(100% - constant(safe-area-inset-left))){.a{width:calc(100% - constant(safe-area-inset-left))}}',
      '.@supports (width:calc(100% - constant(safe-area-inset-left))){.a{width:calc(100% - constant(safe-area-inset-left))}}'
    )
  );
});

test(
  'should not break css variables that have "calc" in their names',
  testCss(
    'a{transform: translateY(calc(-100% - var(--tooltip-calculated-offset)))}',
    'a{transform: translateY(calc(-100% - var(--tooltip-calculated-offset)))}'
  )
);

test(
  'nested var (reduce-css-calc#50)',
  // `/2` → `* .5` (reciprocal); coefficient first.
  testValue(
    'calc(var(--xxx, var(--yyy)) / 2)',
    /* 'calc(var(--xxx, var(--yyy))/2)' */ 'calc(.5 * var(--xxx, var(--yyy)))'
  )
);

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
      /* 'calc(unknown(#fff)*other-unknown(200px))' */ 'calc(unknown(#fff) * other-unknown(200px))'
    )
  );
});

describe('Custom properties', () => {
  test(
    'should not strip calc with single CSS custom variable',
    // single-value calc() unwrapped (§10.6).
    testValue('calc(var(--foo))', /* 'calc(var(--foo))' */ 'var(--foo)')
  );

  test(
    'should strip unnecessary calc with single CSS custom variable',
    // nested calc() flattens, then single-value unwrap.
    testValue('calc(calc(var(--foo)))', /* 'calc(var(--foo))' */ 'var(--foo)')
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
    testValue(
      'CALC( (1EM - CALC( 10PX + 1EM)) / 2)',
      /* '-5PX' */ 'CALC(0em - 5px)'
    )
  );
});

test(
  'should preserve calc when extra parentheses are used',
  // spec-style spaces around `/`.
  testValue(
    'calc((var(--circumference) / var(--number-of-segments)))',
    /* 'calc(var(--circumference)/var(--number-of-segments))' */ 'calc(var(--circumference) / var(--number-of-segments))'
  )
);

describe('Precision', () => {
  test('precision for calc', testValue('calc(100% / 3 * 3)', '100%'));

  test(
    'precision for nested calc',
    testValue('calc(calc(100% / 3) * 3)', '100%')
  );
});

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
