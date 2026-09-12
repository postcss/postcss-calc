'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const postcss = require('postcss');
const reduceCalc = (opts = {}) => require('../src/index.js')(opts);
const { testValue } = require('./helpers/testValue.js');

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
      'constant(safe-area-inset-left)'
    )
  );

  test(
    'should skip env function',
    // single-value calc() unwrapped (§10.6).
    testValue('calc(env(safe-area-inset-left))', 'env(safe-area-inset-left)')
  );

  test(
    'should skip env function (#1)',
    testValue(
      'calc(env(safe-area-inset-left, 50px 20px))',
      'env(safe-area-inset-left, 50px 20px)'
    )
  );

  test(
    'should skip unknown function',
    // single-value calc() unwrapped (§10.6).
    testValue(
      'calc(unknown(safe-area-inset-left))',
      'unknown(safe-area-inset-left)'
    )
  );

  test(
    'should skip attr function',
    testCssDoesNotThrow(
      'foo { width: calc(attr(size ch) * 1.1); }',
      'foo { width: calc(1.1 * attr(size ch)); }'
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
