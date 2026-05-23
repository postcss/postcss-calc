'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const postcss = require('postcss');

// Set `POSTCSS_CALC_CSSTOOLS=1` to swap in @csstools/css-calc as the
// reference oracle (requires tsx loader).
//
// The v10 regression suite is the legacy-behavior conformance baseline:
// it documents what jison did, including non-spec choices that the v11
// pratt simplifier doesn't reproduce by default. We opt into all three
// legacy flags here so existing fixtures express the v10 contract.
// Tests can still override individual flags through `opts`.
const baseCalc = process.env.POSTCSS_CALC_CSSTOOLS
  ? require('../src/pratt/src/plugin/plugin-csstools.ts')
  : require('../');
const reduceCalc = (opts = {}) =>
  baseCalc({
    strictWhitespace: false,
    preserveOrder: true,
    dropZeroIdentities: true,
    ...opts,
  });

const postcssOpts = { from: undefined };

function testValue(fixture, expected, opts = {}) {
  fixture = `foo{bar:${fixture}}`;
  expected = `foo{bar:${expected}}`;

  return async () => {
    const result = await postcss(reduceCalc(opts)).process(
      fixture,
      postcssOpts
    );
    assert.strictEqual(result.css, expected);
  };
}

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

test('should reduce simple calc (1)', testValue('calc(1px + 1px)', '2px'));

test(
  'should reduce simple calc (2)',
  // `2px+3px` lacks the whitespace §10.1 requires; `strictWhitespace: false`
  // recovers jison's lenient acceptance. v11's strict default would reject.
  testValue('calc(1px + 1px);baz:calc(2px+3px)', '2px;baz:5px')
);

test('should reduce simple calc (3)', testValue('calc(1rem * 1.5)', '1.5rem'));

test('should reduce simple calc (4)', testValue('calc(3em - 1em)', '2em'));

test('should reduce simple calc (5', testValue('calc(2ex / 2)', '1ex'));

test(
  'should reduce simple calc (6)',
  testValue('calc(50px - (20px - 30px))', '60px')
);

test(
  'should reduce simple calc (7)',
  // `dropZeroIdentities: true` recovers jison's behavior of dropping the
  // 0-valued length when a percentage sibling carries the type. The strict
  // default preserves `0px + 100%` per WPT calc-serialization-002.
  testValue('calc(100px - (100px - 100%))', '100%')
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
  testValue(
    'calc(0px - (24px - (var(--a) - var(--b)) / 2 + var(--c)))',
    // RESIDUAL: v11 always rewrites `<expr>/2` as `<expr> * 0.5` (reciprocal
    // conversion §10.13); no flag undoes that. With preserveOrder the
    // coefficient lands after the opaque sum (input position). v10 produced
    // `(var(--a) - var(--b))/2`; the spec-equivalent shape here keeps the
    // sum / coefficient in input order with the reciprocal coefficient.
    'calc(-24px + (var(--a) - var(--b)) * 0.5 - var(--c))'
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
  // RESIDUAL: v11 folds `2*2=4` (constant folding); no flag undoes that.
  // preserveOrder keeps the inner sum + the (now-merged) coefficient in
  // input positions.
  testValue('calc(((var(--a) + 4px) * 2) * 2)', 'calc((var(--a) + 4px) * 4)')
);

test(
  'should reduce multiplication before reducing additions',
  testValue(
    'calc(((var(--a) + 4px) * 2) * 2 + 4px)',
    // RESIDUAL: same constant fold as above.
    'calc((var(--a) + 4px) * 4 + 4px)'
  )
);

test(
  'should reduce division',
  // RESIDUAL: v11 folds `1/2/2=0.25` (constant folding) and converts the
  // division to multiplication-by-reciprocal.
  testValue('calc(((var(--a) + 4px) / 2) / 2)', 'calc((var(--a) + 4px) * 0.25)')
);

test(
  'should reduce division before reducing additions',
  testValue(
    'calc(((var(--a) + 4px) / 2) / 2 + 4px)',
    // RESIDUAL: same fold + reciprocal as above.
    'calc((var(--a) + 4px) * 0.25 + 4px)'
  )
);

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

test(
  'should reduce nested calc',
  testValue('calc(100% - calc(50% + 25px))', 'calc(50% - 25px)')
);

test(
  'should reduce vendor-prefixed nested calc',
  testValue(
    '-webkit-calc(100% - -webkit-calc(50% + 25px))',
    '-webkit-calc(50% - 25px)'
  )
);

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

test(
  'should ignore calc with css variables (1)',
  // `preserveOrder: true` keeps the operands in input order; only the
  // serializer's spec-style spacing around `*` differs from OLD jison.
  testValue('calc(var(--mouseX) * 1px)', 'calc(var(--mouseX) * 1px)')
);

test(
  'should ignore calc with css variables (2)',
  testValue(
    'calc(10px - (100px * var(--mouseX)))',
    // NEW: spec-style spaced '*' operator. Equivalent to OLD.
    /* 'calc(10px - 100px*var(--mouseX))' */ 'calc(10px - 100px * var(--mouseX))'
  )
);

test(
  'should ignore calc with css variables (3)',
  testValue(
    'calc(10px - (100px + var(--mouseX)))',
    'calc(-90px - var(--mouseX))'
  )
);

test(
  'should ignore calc with css variables (4)',
  testValue(
    'calc(10px - (100px / var(--mouseX)))',
    // NEW: spec-style spaced '/' operator. Equivalent to OLD.
    /* 'calc(10px - 100px/var(--mouseX))' */ 'calc(10px - 100px / var(--mouseX))'
  )
);

test(
  'should ignore calc with css variables (5)',
  testValue(
    'calc(10px - (100px - var(--mouseX)))',
    'calc(-90px + var(--mouseX))'
  )
);

test(
  'should ignore calc with css variables (6)',
  // RESIDUAL: division-by-constant always becomes multiplication-by-
  // reciprocal (var/2 → var * 0.5); preserveOrder places the coefficient
  // after the var (input position).
  testValue('calc(var(--popupHeight) / 2)', 'calc(var(--popupHeight) * 0.5)')
);

test(
  'should ignore calc with css variables (7)',
  testValue(
    'calc(var(--popupHeight) / 2 + var(--popupWidth) / 2)',
    // RESIDUAL: same reciprocal transform, applied to both terms.
    'calc(var(--popupHeight) * 0.5 + var(--popupWidth) * 0.5)'
  )
);


test(
 'should ignore multiplication with infinity',
// NEW: spec-style spaced '*'. Equivalent to OLD.
testValue('calc(infinity * 1px)', /* 'calc(infinity*1px)' */ 'calc(infinity * 1px)')
);

test(
 'should ignore addition with infinity',
testValue('calc(infinity + 1px)', 'calc(infinity + 1px)')
);

test(
 'should ignore multiplication with pi',
// NEW: folds 'pi' constant per CSS Values 4 §10.7.1. OLD kept it symbolic.
testValue('calc(1px * pi)', /* 'calc(1px*pi)' */ '3.14159px')
);

test(
 'should ignore addition with pi',
// NEW: folds '43 + pi' to a numeric. OLD kept 'pi' symbolic.
testValue('calc(43 + pi)', /* 'calc(43 + pi)' */ '46.14159')
);

test(
 'should preserve e',
// NEW: folds 'e' constant per spec §10.7.1. OLD kept it symbolic.
testValue('calc(e)', /* 'calc(e)' */ '2.71828')
);


test(
  'should reduce calc with newline characters',
  testValue('calc(\n1rem \n* 2 \n* 1.5)', '3rem')
);

test(
  'should preserve calc with incompatible units',
  testValue('calc(100% + 1px)', 'calc(100% + 1px)')
);

test(
  'should preserve calc with cqw units',
  testValue('calc(12.72727px + 8.523cqw)', 'calc(12.72727px + 8.523cqw)')
);

test(
  'should add numbers with cqw units',
  testValue('calc(1cqw + 8cqw)', '9cqw')
);

test(
  'should add numbers with cqh units',
  testValue('calc(1cqh + 3cqh)', '4cqh')
);

test(
  'should add numbers with cqi units',
  testValue('calc(1cqi + 3cqi)', '4cqi')
);

test(
  'should add numbers with cqb units',
  testValue('calc(1cqb + 3cqb)', '4cqb')
);

test(
  'should add numbers with cqmin units',
  testValue('calc(1cqmin + 3cqmin)', '4cqmin')
);

test(
  'should add numbers with cqmax units',
  testValue('calc(1cqmax + 3cqmax)', '4cqmax')
);

test(
  'should add expressions with svh units',
  testValue(
    'calc(98% - 1.5rem - (85svh/8.2 + 1.9rem + 1.65svh))',
    'calc(98% - 3.4rem - 12.01585svh)'
  )
);

test(
  'should not combine different viewport units',
  testValue('calc(100svmax - 44.5svh)', 'calc(100svmax - 44.5svh)')
);

test(
  'should add numbers with lh units',
  testValue('calc(1lh + 4lh)', '5lh')
);

test(
  'should add numbers with rlh units',
  testValue('calc(1rlh + 4rlh)', '5rlh')
);

test(
  'should not combine different lh units',
  testValue('calc(1lh + 4rlh)', 'calc(1lh + 4rlh)')
);

test(
  'should not combine different lh units',
  testValue('calc(1lh + 20px)', 'calc(1lh + 20px)')
);

test(
  'should parse fractions without leading zero',
  testValue('calc(2rem - .14285em)', 'calc(2rem - 0.14285em)')
);

test('should handle precision correctly (1)', testValue('calc(1/100)', '0.01'));

test(
  'should handle precision correctly (2)',
  testValue('calc(5/1000000)', '0.00001')
);

test(
  'should handle precision correctly (3)',
  testValue('calc(5/1000000)', '0.000005', { precision: 6 })
);

test(
  'should reduce browser-prefixed calc (1)',
  testValue('-webkit-calc(1px + 1px)', '2px')
);

test(
  'should reduce browser-prefixed calc (2)',
  testValue('-moz-calc(1px + 1px)', '2px')
);

test(
  'should discard zero values (#2) (1)',
  testValue('calc(100vw / 2 - 6px + 0px)', 'calc(50vw - 6px)')
);

test(
  'should discard zero values (#2) (2)',
  testValue('calc(500px - 0px)', '500px')
);

test(
  'should not perform addition on unitless values (#3)',
  // `preserveOrder: true` keeps the operands in input order.
  testValue('calc(1px + 1)', 'calc(1px + 1)')
);

test(
  'should reduce consecutive substractions (#24) (1)',
  testValue('calc(100% - 120px - 60px)', 'calc(100% - 180px)')
);

test(
  'should reduce consecutive substractions (#24) (2)',
  testValue('calc(100% - 10px - 20px)', 'calc(100% - 30px)')
);

test(
  'should reduce mixed units of time (postcss-calc#33)',
  testValue('calc(1s - 50ms)', '0.95s')
);

test(
  'should correctly reduce calc with mixed units (cssnano#211)',
  // `dropZeroIdentities: true` drops the 0rem since the percentage sibling
  // already carries the type. Strict default keeps `0rem` per WPT.
  testValue('calc(99.99% * 1/1 - 0rem)', '99.99%')
);

test(
  'should apply optimization (cssnano#320)',
  testValue('calc(50% + (5em + 5%))', 'calc(55% + 5em)')
);

test(
  'should reduce substraction from zero',
  testValue('calc( 0 - 10px)', '-10px')
);

test(
  'should reduce subtracted expression from zero',
  testValue('calc( 0 - calc(1px + 1em) )', 'calc(-1px - 1em)')
);

test(
  'should reduce substracted expression from zero (1)',
  testValue('calc( 0 - (100vw - 10px) / 2 )', 'calc(-50vw + 5px)')
);

test(
  'should reduce substracted expression from zero (2)',
  testValue('calc( 0px - (100vw - 10px))', 'calc(10px - 100vw)')
);

test(
  'should reduce substracted expression from zero (3)',
  testValue('calc( 0px - (100vw - 10px) * 2 )', 'calc(20px - 200vw)')
);

test(
  'should reduce substracted expression from zero (4)',
  testValue('calc( 0px - (100vw + 10px))', 'calc(-10px - 100vw)')
);

test(
  'should reduce substracted expression from zero (css-variable)',
  testValue(
    'calc( 0px - (var(--foo, 4px) / 2))',
    // RESIDUAL: dropZeroIdentities removes the leading `0px` so the
    // remaining negated product collapses to a unary-minus form. The
    // reciprocal conversion (`/2` → `* 0.5`) is unaffected by any flag.
    'calc(-(var(--foo, 4px) * 0.5))'
  )
);

test(
  'should reduce nested expression',
  // `dropZeroIdentities: true` drops the 0em since 5px carries the type.
  testValue('calc( (1em - calc( 10px + 1em)) / 2)', '-5px')
);

test(
  'should skip constant function',
  testValue(
    'calc(constant(safe-area-inset-left))',
    // NEW: unwraps redundant calc() around a single non-numeric function (constant/env). Per spec §10.6 a calc() with a single value is replaced by that value.
    /* 'calc(constant(safe-area-inset-left))' */ 'constant(safe-area-inset-left)'
  )
);

test(
  'should skip env function',
  testValue(
    'calc(env(safe-area-inset-left))',
    // NEW: unwraps redundant calc() around env().
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
  testValue(
    'calc(unknown(safe-area-inset-left))',
    // NEW: unwraps redundant calc() around an unknown opaque function.
    /* 'calc(unknown(safe-area-inset-left))' */ 'unknown(safe-area-inset-left)'
  )
);

test(
  'should preserve the original declaration when `preserve` option is set to true',
  testCss('foo{bar:calc(1rem * 1.5)}', 'foo{bar:1.5rem;bar:calc(1rem * 1.5)}', {
    preserve: true,
  })
);

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
  'should reduce mixed units of time (#33)',
  testValue('calc(1s - 50ms)', '0.95s')
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
  // `dropZeroIdentities: true` drops the 0em since 50px carries the type.
  testValue('calc((100px - 1em) + (-50px + 1em))', '50px')
);

test(
  'should discard zero values (reduce-css-calc#2) (1)',
  testValue('calc(100vw / 2 - 6px + 0px)', 'calc(50vw - 6px)')
);

test(
  'should discard zero values (reduce-css-calc#2) (2)',
  testValue('calc(500px - 0px)', '500px')
);

test(
  'should not perform addition on unitless values (reduce-css-calc#3)',
  // `preserveOrder: true` keeps the operands in input order.
  testValue('calc(1px + 1)', 'calc(1px + 1)')
);

test(
  'should return the same and not thrown an exception for attribute selectors without a value',
  testCss('button[disabled]{}', 'button[disabled]{}', { selectors: true })
);

test(
  'should ignore reducing custom property',
  testCss(
    ':root { --foo: calc(var(--bar) / 8); }',
    // RESIDUAL: division-by-constant → multiplication-by-reciprocal
    // (`/ 8` → `* 0.125`). preserveOrder keeps var first.
    ':root { --foo: calc(var(--bar) * 0.125); }'
  )
);

test(
  'should ignore media queries',
  testCss(
    '@media (min-width:calc(10px+10px)){}',
    '@media (min-width:calc(10px+10px)){}'
  )
);

test(
  'should reduce calc in media queries when `mediaQueries` option is set to true',
  // `strictWhitespace: false` recovers jison's lenient acceptance of
  // `10px+10px`. The strict default would reject it.
  testCss('@media (min-width:calc(10px+10px)){}', '@media (min-width:20px){}', {
    mediaQueries: true,
  })
);

test(
  'should ignore selectors (1)',
  testCss('div[data-size="calc(3*3)"]{}', 'div[data-size="calc(3*3)"]{}')
);

test(
  'should ignore selectors (2)',
  testCss('div:nth-child(2n + calc(3*3)){}', 'div:nth-child(2n + calc(3*3)){}')
);

test(
  'should reduce calc in selectors when `selectors` option is set to true (1)',
  testCss('div[data-size="calc(3*3)"]{}', 'div[data-size="9"]{}', {
    selectors: true,
  })
);

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

test(
  'should not break css variables that have "calc" in their names',
  testCss(
    'a{transform: translateY(calc(-100% - var(--tooltip-calculated-offset)))}',
    'a{transform: translateY(calc(-100% - var(--tooltip-calculated-offset)))}'
  )
);

test(
  'should handle complex calculations (reduce-css-calc#45) (1)',
  testValue(
    'calc(100% + (2 * 100px) - ((75.37% - 63.5px) - 900px))',
    'calc(24.63% + 1163.5px)'
  )
);

test(
  'should handle complex calculations (reduce-css-calc#45) (2)',
  testValue(
    'calc(((((100% + (2 * 30px) + 63.5px) / 0.7537) - (100vw - 60px)) / 2) + 30px)',
    'calc(66.33939% + 141.92915px - 50vw)'
  )
);

test(
  'should handle advanced arithmetic (1)',
  testValue(
    'calc(((75.37% - 63.5px) - 900px) + (2 * 100px))',
    'calc(75.37% - 763.5px)'
  )
);

test(
  'should handle advanced arithmetic (2)',
  testValue(
    'calc((900px - (10% - 63.5px)) + (2 * 100px))',
    'calc(1163.5px - 10%)'
  )
);

test(
  'should handle nested calc statements (reduce-css-calc#49)',
  // `dropZeroIdentities: true` drops the 0px since 2.25rem carries the type.
  testValue('calc(calc(2.25rem + 2px) - 1px * 2)', '2.25rem')
);

test(
  'should throw an exception when attempting to divide by zero',
  // NEW spec-aligned: division-by-zero per CSS Values 4 §10.13 yields infinity (no error). OLD threw.
  // testThrows('calc(500px/0)', 'calc(500px/0)', 'Cannot divide by zero')
  testValue('calc(500px/0)', 'calc(infinity * 1px)')
);

test(
  'should throw an exception when attempting to divide by unit (#1)',
  // NEW spec-aligned: 500px/2px = 250 (unitless) per spec division rules. OLD threw.
  // testThrows('calc(500px/2px)', 'calc(500px/2px)', 'Cannot divide by "px", number expected')
  testValue('calc(500px/2px)', '250')
);

test(
  'nested var (reduce-css-calc#50)',
  testValue(
    'calc(var(--xxx, var(--yyy)) / 2)',
    // RESIDUAL: division → multiplication-by-reciprocal. preserveOrder
    // keeps var first.
    'calc(var(--xxx, var(--yyy)) * 0.5)'
  )
);

test(
  'should not throw an exception when unknow function exist in calc',
  testValue(
    'calc(unknown(#fff) - other-unknown(200px))',
    'calc(unknown(#fff) - other-unknown(200px))'
  )
);

test(
  'should not throw an exception when unknow function exist in calc (#1)',
  testValue(
    'calc(unknown(#fff) * other-unknown(200px))',
    // NEW: spec-style spaced '*'.
    /* 'calc(unknown(#fff)*other-unknown(200px))' */ 'calc(unknown(#fff) * other-unknown(200px))'
  )
);

test(
  'should not strip calc with single CSS custom variable',
  // NEW: unwraps redundant calc() around a single var() per spec §10.6.
  testValue('calc(var(--foo))', /* 'calc(var(--foo))' */ 'var(--foo)')
);

test(
  'should strip unnecessary calc with single CSS custom variable',
  // NEW: flattens nested calc() and unwraps to a bare var().
  testValue('calc(calc(var(--foo)))', /* 'calc(var(--foo))' */ 'var(--foo)')
);

test(
  'should not strip calc with single CSS custom variables and value',
  // `preserveOrder: true` keeps the operands in input order.
  testValue('calc(var(--foo) + 10px)', 'calc(var(--foo) + 10px)')
);

// NEW: unit case normalized to lowercase. CSS units are case-insensitive but conventionally lowercase.
test('should reduce calc (uppercase)', testValue('CALC(1PX + 1PX)', /* '2PX' */ '2px'));

test(
  'should reduce calc (uppercase) (#1)',
  testValue('CALC(VAR(--foo) + VAR(--bar))', 'CALC(VAR(--foo) + VAR(--bar))')
);

test(
  'should reduce calc (uppercase) (#2)',
  // RESIDUAL: v11 normalizes the unit case to lowercase (`5PX` → `5px`)
  // unconditionally; no flag undoes that. dropZeroIdentities removes the
  // 0em sibling so the wrapper unwraps to a bare value.
  testValue('CALC( (1EM - CALC( 10PX + 1EM)) / 2)', '-5px')
);

test(
  'should handle nested calc function (#1)',
  testValue(
    'calc(calc(var(--foo) + var(--bar)) + var(--baz))',
    'calc(var(--foo) + var(--bar) + var(--baz))'
  )
);

test(
  'should handle nested calc function (#2)',
  testValue(
    'calc(var(--foo) + calc(var(--bar) + var(--baz)))',
    'calc(var(--foo) + var(--bar) + var(--baz))'
  )
);

test(
  'should handle nested calc function (#3)',
  testValue(
    'calc(calc(var(--foo) - var(--bar)) - var(--baz))',
    'calc(var(--foo) - var(--bar) - var(--baz))'
  )
);

test(
  'should handle nested calc function (#4)',
  testValue(
    'calc(var(--foo) - calc(var(--bar) - var(--baz)))',
    'calc(var(--foo) - var(--bar) + var(--baz))'
  )
);

test(
  'should handle nested calc function (#5)',
  testValue(
    'calc(calc(var(--foo) + var(--bar)) - var(--baz))',
    'calc(var(--foo) + var(--bar) - var(--baz))'
  )
);

test(
  'should handle nested calc function (#6)',
  testValue(
    'calc(var(--foo) + calc(var(--bar) - var(--baz)))',
    'calc(var(--foo) + var(--bar) - var(--baz))'
  )
);

test(
  'should handle nested calc function (#7)',
  testValue(
    'calc(calc(var(--foo) - var(--bar)) + var(--baz))',
    'calc(var(--foo) - var(--bar) + var(--baz))'
  )
);

test(
  'should handle nested calc function (#8)',
  testValue(
    'calc(var(--foo) - calc(var(--bar) + var(--baz)))',
    'calc(var(--foo) - var(--bar) - var(--baz))'
  )
);

test(
  'should handle nested calc function (#9)',
  testValue(
    'calc(calc(var(--foo) + var(--bar)) * var(--baz))',
    // NEW: spec-style spaced '*'.
    /* 'calc((var(--foo) + var(--bar))*var(--baz))' */ 'calc((var(--foo) + var(--bar)) * var(--baz))'
  )
);

test(
  'should handle nested calc function (#10)',
  testValue(
    'calc(var(--foo) * calc(var(--bar) + var(--baz)))',
    // NEW: spec-style spaced '*'.
    /* 'calc(var(--foo)*(var(--bar) + var(--baz)))' */ 'calc(var(--foo) * (var(--bar) + var(--baz)))'
  )
);

test(
  'should handle nested calc function (#11)',
  testValue(
    'calc(calc(var(--foo) + var(--bar)) / var(--baz))',
    // NEW: spec-style spaced '/'.
    /* 'calc((var(--foo) + var(--bar))/var(--baz))' */ 'calc((var(--foo) + var(--bar)) / var(--baz))'
  )
);

test(
  'should handle nested calc function (#12)',
  testValue(
    'calc(var(--foo) / calc(var(--bar) + var(--baz)))',
    // NEW: spec-style spaced '/'.
    /* 'calc(var(--foo)/(var(--bar) + var(--baz)))' */ 'calc(var(--foo) / (var(--bar) + var(--baz)))'
  )
);

test(
  'should handle nested calc function (#13)',
  testValue(
    'calc(100vh - 5rem - calc(10rem + 100px))',
    'calc(100vh - 15rem - 100px)'
  )
);

test(
  'should handle nested calc function (#14)',
  testValue('calc(100% - calc(10px + 2vw))', 'calc(100% - 10px - 2vw)')
);

test(
  'should handle nested calc function (#15)',
  testValue('calc(100% - calc(10px - 2vw))', 'calc(100% - 10px + 2vw)')
);

test(
  'should preserve division precedence',
  testValue(
    'calc(100%/(var(--aspect-ratio)))',
    // NEW: drops redundant inner parens around var() + spec-style spaced '/'.
    /* 'calc(100%/(var(--aspect-ratio)))' */ 'calc(100% / var(--aspect-ratio))'
  )
);

test(
  'should preserve division precedence (2)',
  testValue(
    `calc(
        (var(--fluid-screen) - ((var(--fluid-min-width) / 16) * 1rem)) /
        ((var(--fluid-max-width) / 16) - (var(--fluid-min-width) / 16))
    )`,
    // RESIDUAL: division-by-constant becomes multiplication-by-reciprocal
    // (`/16` → `* 0.0625`); preserveOrder keeps each var ahead of its
    // coefficient (input position).
    'calc((var(--fluid-screen) - var(--fluid-min-width) * 0.0625 * 1rem) / (var(--fluid-max-width) * 0.0625 - var(--fluid-min-width) * 0.0625))'
  )
);

test(
  'should preserve division precedence (3)',
  // NEW: folds 1/(10/x) = 0.1 * x via reciprocal.
  testValue('calc(1/(10/var(--dot-size)))', /* 'calc(1/(10/var(--dot-size)))' */ 'calc(0.1 * var(--dot-size))')
);

test(
  'should correctly preserve parentheses',
  testValue(
    'calc(1/((var(--a) - var(--b))/16))',
    // RESIDUAL: input is `1 / ((var(--a) - var(--b)) / 16)` = `16 /
    // (var(--a) - var(--b))` mathematically. preserveOrder keeps the
    // numerator factors at their input positions, so the unsimplified
    // shape `1 / (var(--a) - var(--b)) * 16` is what we emit. v11's
    // simplifier doesn't collapse this to the equivalent `16 / (...)`
    // form; cancellation across opposing exponents is single-pair only.
    'calc(1 / (var(--a) - var(--b)) * 16)'
  )
);

test(
  'should preserve calc when extra parentheses are used',
  testValue(
    'calc((var(--circumference) / var(--number-of-segments)))',
    // NEW: spec-style spaced '/'.
    /* 'calc(var(--circumference)/var(--number-of-segments))' */ 'calc(var(--circumference) / var(--number-of-segments))'
  )
);

test('precision for calc', testValue('calc(100% / 3 * 3)', '100%'));

test(
  'precision for nested calc',
  testValue('calc(calc(100% / 3) * 3)', '100%')
);

test('plus sign', testValue('calc(+100px + +100px)', '200px'));

test('plus sign (#1)', testValue('calc(+100px - +100px)', '0px'));

test('plus sign (#2)', testValue('calc(200px * +1)', '200px'));

test('plus sign (#3)', testValue('calc(200px / +1)', '200px'));

test('minus sign', testValue('calc(-100px + -100px)', '-200px'));

test('minus sign (#2)', testValue('calc(-100px - -100px)', '0px'));

test('minus sign (#3)', testValue('calc(200px * -1)', '-200px'));

test('minus sign (#4)', testValue('calc(200px / -1)', '-200px'));

test('whitespace', testValue('calc( 100px + 100px )', '200px'));

test('whitespace (#1)', testValue('calc(\t100px\t+\t100px\t)', '200px'));

test('whitespace (#2)', testValue('calc(\n100px\n+\n100px\n)', '200px'));

test(
  'whitespace (#4)',
  testValue('calc(\r\n100px\r\n+\r\n100px\r\n)', '200px')
);

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

test('exponent composed', testValue('calc(1.1e+1px + 1.1e+1px)', '22px'));

test('exponent composed (#1)', testValue('calc(10e+1px + 10e+1px)', '200px'));

test(
  'exponent composed (#2)',
  testValue('calc(1.1e+10px + 1.1e+10px)', '22000000000px')
);

test('exponent composed (#3)', testValue('calc(9e+1 * 1px)', '90px'));

test('exponent composed (#4)', testValue('calc(9e+1% + 10%)', '100%'));

test(
  'exponent composed (uppercase)',
  testValue('calc(1.1E+1px + 1.1E+1px)', '22px')
);

test('convert units', testValue('calc(1cm + 1px)', '1.02646cm'));

test('convert units (#1)', testValue('calc(1px + 1cm)', '38.79528px'));

// NEW: 'Q' unit normalized to lowercase 'q'. Both are valid; lowercase is conventional.
test('convert units (#2)', testValue('calc(10Q + 10Q)', /* '20Q' */ '20q'));

test('convert units (#3)', testValue('calc(100.9q + 10px)', '111.48333q'));

test('convert units (#4)', testValue('calc(10px + 100.9q)', '105.33858px'));

test('convert units (#5)', testValue('calc(10cm + 1px)', '10.02646cm'));

test('convert units (#6)', testValue('calc(10mm + 1px)', '10.26458mm'));

test('convert units (#7)', testValue('calc(10px + 1q)', '10.94488px'));

test('convert units (#8)', testValue('calc(10cm + 1q)', '10.025cm'));

test('convert units (#9)', testValue('calc(10mm + 1q)', '10.25mm'));

test('convert units (#10)', testValue('calc(10in + 1q)', '10.00984in'));

test('convert units (#11)', testValue('calc(10pt + 1q)', '10.70866pt'));

test('convert units (#12)', testValue('calc(10pc + 1q)', '10.05906pc'));

test('convert units (#13)', testValue('calc(1q + 10px)', '11.58333q'));

test('convert units (#14)', testValue('calc(1q + 10cm)', '401q'));

test('convert units (#15)', testValue('calc(1q + 10mm)', '41q'));

test('convert units (#16)', testValue('calc(1q + 10in)', '1017q'));

test('convert units (#17)', testValue('calc(1q + 10pt)', '15.11111q'));

test('convert units (#18)', testValue('calc(1q + 10pc)', '170.33333q'));

test(
  'unknown units',
  // NEW debatable: identical unknown unit strings are combined arithmetically (1+2=3). Spec is ambiguous about unknown units; OLD treated them as opaque.
  testValue('calc(1unknown + 2unknown)', /* 'calc(1unknown + 2unknown)' */ '3unknown')
);

test(
  'unknown units with known',
  testValue('calc(1unknown + 2px)', 'calc(1unknown + 2px)')
);

test(
  'unknown units with known (#1)',
  testValue('calc(1px + 2unknown)', 'calc(1px + 2unknown)')
);

test(
  'calc-size should be ignored',
  testCssDoesNotThrow('.foo{block-size: calc-size(auto, size)}', '.foo{block-size: calc-size(auto, size)}')
);

test(
  'error with parsing',
  // testThrows(
  //   'calc(10pc + unknown)',
  //   'calc(10pc + unknown)',
  //   'Lexical error on line 1: Unrecognized text.\n\n  Erroneous area:\n1: 10pc + unknown\n^.........^'
  // )
  testValue('calc(10pc + unknown)', 'calc(10pc + unknown)')
);
