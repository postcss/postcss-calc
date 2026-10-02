'use strict';

const { describe, test } = require('node:test');
const { testValue, testCss } = require('./helpers/testValue.js');

describe('Discard zero values', () => {
  test(
    'should discard zero values (reduce-css-calc#2) (1)',
    testValue('calc(100vw / 2 - 6px + 0px)', 'calc(50vw - 6px)')
  );

  test(
    'should discard zero values (reduce-css-calc#2) (2)',
    testValue('calc(500px - 0px)', 'calc(500px)')
  );
});

test(
  'should return the same and not thrown an exception for attribute selectors without a value',
  testCss('button[disabled]{}', 'button[disabled]{}', { selectors: true })
);

describe('Ignore', () => {
  test(
    'should keep the division after a custom property',
    testCss(
      ':root { --foo: calc(var(--bar) / 8); }',
      ':root { --foo: calc(var(--bar) / 8); }'
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
    '@media (min-width:calc(10px+10px)){}',
    {
      mediaQueries: true,
    }
  )
);

describe('Ignore', () => {
  test(
    'should ignore attribute selectors',
    testCss('div[data-size="calc(3*3)"]{}', 'div[data-size="calc(3*3)"]{}')
  );

  test(
    'should ignore nth-child pseudo-class',
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
  'should keep division a s written in a nested var (reduce-css-calc#50)',
  testValue(
    'calc(var(--xxx, var(--yyy)) / 2)',
    'calc(var(--xxx, var(--yyy)) / 2)'
  )
);

test(
  'should keep the default precision when precision is undefined',
  testCss('a{width:calc(100% / 3)}', 'a{width:calc(100% / 3)}', {
    precision: undefined,
  })
);
