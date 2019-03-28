import test from 'ava';
import postcss from 'postcss';

import reduceCalc from '../../dist';

const postcssOpts =  { from: undefined }

function testValue(t, fixture, expected = null, opts = {}) {
  if (expected === null) {
    expected = fixture;
  }
  fixture = `foo{bar:${fixture}}`;
  expected = `foo{bar:${expected}}`;
  return testCss(t, fixture, expected, opts);
}

function testCss(t, fixture, expected = null, opts = {}) {
  if (expected === null) {
    expected = fixture;
  }
	t.plan(1);
  return postcss(reduceCalc(opts)).process(fixture, postcssOpts).then(result => {
    t.deepEqual(result.css, expected);
  });
}

async function testThrows(t, fixture, expected, opts) {
  fixture = `foo{bar:${fixture}}`;
  await t.throwsAsync(() => postcss(reduceCalc(opts)).process(fixture, postcssOpts), expected);
}

test(
	'should reduce simple calc (1)',
	testValue,
	'calc(1px + 1px)',
	'2px',
);

test(
	'should reduce simple calc (2)',
	testValue,
	'calc(1px + 1px);baz:calc(2px+3px)',
	'2px;baz:5px',
);

test(
	'should reduce simple calc (3)',
	testValue,
	'calc(1rem * 1.5)',
	'1.5rem',
);

test(
	'should reduce simple calc (4)',
	testValue,
	'calc(3em - 1em)',
	'2em',
);

test(
	'should reduce simple calc (5',
	testValue,
	'calc(2ex / 2)',
	'1ex',
);

test(
	'should reduce simple calc (6)',
	testValue,
	'calc(50px - (20px - 30px))',
	'60px',
);

test(
	'should reduce simple calc (7)',
	testValue,
	'calc(100px - (100px - 100%))',
	'100%',
);

test(
	'should reduce simple calc (8)',
	testValue,
	'calc(100px + (100px - 100%))',
	'calc(200px - 100%)',
);

test(
	'should reduce additions and subtractions (1)',
	testValue,
	'calc(100% - 10px + 20px)',
	'calc(100% + 10px)',
);

test(
	'should reduce additions and subtractions (2)',
	testValue,
	'calc(100% + 10px - 20px)',
	'calc(100% - 10px)',
);

test(
	'should reduce additions and subtractions (3)',
	testValue,
	'calc(1px - (2em + 3%))',
	'calc(1px - 2em - 3%)',
);

test(
	'should reduce additions and subtractions (4)',
	testValue,
	'calc((100vw - 50em) / 2)',
	'calc((100vw - 50em)/2)',
);

test(
	'should ignore value surrounding calc function (1)',
	testValue,
	'a calc(1px + 1px)',
	'a 2px',
);


test(
	'should ignore value surrounding calc function (2)',
	testValue,
	'calc(1px + 1px) a',
	'2px a',
);

test(
	'should ignore value surrounding calc function (3)',
	testValue,
	'a calc(1px + 1px) b',
	'a 2px b',
);

test(
	'should ignore value surrounding calc function (4)',
	testValue,
	'a calc(1px + 1px) b calc(1em + 2em) c',
	'a 2px b 3em c',
);

test(
	'should reduce nested calc',
	testValue,
	'calc(100% - calc(50% + 25px))',
	'calc(50% - 25px)',
);

test(
	'should reduce vendor-prefixed nested calc',
	testValue,
	'-webkit-calc(100% - -webkit-calc(50% + 25px))',
	'-webkit-calc(50% - 25px)',
);

test(
	'should reduce uppercase calc (1)',
	testValue,
	'CALC(1px + 1px)',
	'2px',
);

test(
	'should reduce uppercase calc (2)',
	testValue,
	'CALC(1px + CALC(2px / 2))',
	'2px',
);

test(
	'should reduce uppercase calc (3)',
	testValue,
	'-WEBKIT-CALC(1px + 1px)',
	'2px',
);

test(
	'should reduce uppercase calc (4)',
	testValue,
	'-WEBKIT-CALC(1px + -WEBKIT-CALC(2px / 2))',
	'2px',
);

test(
  'should ignore calc with css variables (1)',
  testValue,
  'calc(var(--mouseX) * 1px)',
  'calc(var(--mouseX)*1px)',
);

test(
  'should ignore calc with css variables (2)',
  testValue,
  'calc(10px - (100px * var(--mouseX)))',
  'calc(10px - 100px*var(--mouseX))',
);

test(
  'should ignore calc with css variables (3)',
  testValue,
  'calc(10px - (100px + var(--mouseX)))',
  'calc(-90px - var(--mouseX))',
);

test(
  'should ignore calc with css variables (4)',
  testValue,
  'calc(10px - (100px / var(--mouseX)))',
  'calc(10px - 100px/var(--mouseX))',
);

test(
  'should ignore calc with css variables (5)',
  testValue,
  'calc(10px - (100px - var(--mouseX)))',
  'calc(-90px + var(--mouseX))',
);

test(
  'should ignore calc with css variables (6)',
  testValue,
  'calc(var(--popupHeight) / 2)',
  'calc(var(--popupHeight)/2)',
);


test(
	'should reduce calc with newline characters',
	testValue,
	'calc(\n1rem \n* 2 \n* 1.5)',
	'3rem',
);

test(
	'should preserve calc with incompatible units',
	testValue,
	'calc(100% + 1px)',
	'calc(100% + 1px)',
);

test(
  'should parse fractions without leading zero',
  testValue,
  'calc(2rem - .14285em)',
  'calc(2rem - 0.14285em)',
);

test(
	'should handle precision correctly (1)',
	testValue,
	'calc(1/100)',
	'0.01',
);

test(
	'should handle precision correctly (2)',
	testValue,
	'calc(5/1000000)',
	'0.00001',
);

test(
	'should handle precision correctly (3)',
	testValue,
	'calc(5/1000000)',
	'0.000005',
	{ precision: 6 }
);

test(
  'should reduce browser-prefixed calc (1)',
  testValue,
  '-webkit-calc(1px + 1px)',
  '2px',
);

test(
  'should reduce browser-prefixed calc (2)',
  testValue,
  '-moz-calc(1px + 1px)',
  '2px',
);

test(
  'should discard zero values (#2) (1)',
  testValue,
  'calc(100vw / 2 - 6px + 0px)',
  'calc(50vw - 6px)',
);

test(
  'should discard zero values (#2) (2)',
  testValue,
  'calc(500px - 0px)',
  '500px',
);


test(
  'should not perform addition on unitless values (#3)',
  testValue,
  'calc(1px + 1)',
  'calc(1px + 1)',
);

test(
  'should reduce consecutive substractions (#24) (1)',
  testValue,
  'calc(100% - 120px - 60px)',
  'calc(100% - 180px)',
);

test(
  'should reduce consecutive substractions (#24) (2)',
  testValue,
  'calc(100% - 10px - 20px)',
  'calc(100% - 30px)',
);

test(
  'should reduce mixed units of time (postcss-calc#33)',
  testValue,
  'calc(1s - 50ms)',
  '0.95s',
);

test(
  'should correctly reduce calc with mixed units (cssnano#211)',
  testValue,
  'calc(99.99% * 1/1 - 0rem)',
  '99.99%',
);

test(
  'should apply optimization (cssnano#320)',
  testValue,
  'calc(50% + (5em + 5%))',
  'calc(55% + 5em)',
);

test(
  'should reduce substraction from zero',
  testValue,
  'calc( 0 - 10px)',
  '-10px',
);

test(
  'should reduce subtracted expression from zero',
  testValue,
  'calc( 0 - calc(1px + 1em) )',
  'calc(-1px + -1em)',
);

test(
  'should reduce nested expression',
  testValue,
  'calc( (1em - calc( 10px + 1em)) / 2)',
  '-5px',
);

test(
  'should skip constant()',
  testValue,
  'calc(constant(safe-area-inset-left))',
  'constant(safe-area-inset-left)',
);

test(
  'should skip env()',
  testValue,
  'calc(env(safe-area-inset-left))',
  'env(safe-area-inset-left)',
);

test(
	'should preserve the original declaration when `preserve` option is set to true',
	testCss,
	'foo{bar:calc(1rem * 1.5)}',
	'foo{bar:1.5rem;bar:calc(1rem * 1.5)}',
	{ preserve: true }
);

test(
	'should not yield warnings when nothing is wrong',
	testValue,
	'calc(500px - 0px)',
	'500px',
	{ warnWhenCannotResolve: true }
);

test(
	'should warn when calc expression cannot be reduced to a single value',
	testValue,
	'calc(100% + 1px)',
	'calc(100% + 1px)',
	{ warnWhenCannotResolve: true },
	[ /^Could not reduce expression:/ ]
);

test(
	'should reduce mixed units of time (#33)',
	testValue,
	'calc(1s - 50ms)',
	'0.95s',
);

test(
  'should not parse variables as calc expressions (#35)',
  testCss,
	'foo:nth-child(2n + $var-calc){}',
	'foo:nth-child(2n + $var-calc){}',
	{ selectors: true }
);

test(
	'should apply algebraic reduction (cssnano#319)',
	testValue,
	'calc((100px - 1em) + (-50px + 1em))',
	'50px',
);

test(
	'should discard zero values (reduce-css-calc#2) (1)',
	testValue,
	'calc(100vw / 2 - 6px + 0px)',
	'calc(50vw - 6px)',
);

test(
	'should discard zero values (reduce-css-calc#2) (2)',
	testValue,
	'calc(500px - 0px)',
	'500px',
);

test(
	'should not perform addition on unitless values (reduce-css-calc#3)',
	testValue,
	'calc(1px + 1)',
	'calc(1px + 1)',
);

test(
  'should return the same and not thrown an exception for attribute selectors without a value',
  testCss,
	'button[disabled]{}',
	'button[disabled]{}',
	{ selectors: true }
);

test(
  'should ignore reducing custom property',
  testCss,
	':root { --foo: calc(var(--bar) / 8); }',
	':root { --foo: calc(var(--bar)/8); }',
);


test(
	'should ignore media queries',
  testCss,
	'@media (min-width:calc(10px+10px)){}',
);

test(
	'should reduce calc in media queries when `mediaQueries` option is set to true',
  testCss,
  '@media (min-width:calc(10px+10px)){}',
	'@media (min-width:20px){}',
	{ mediaQueries: true }
);

test(
	'should ignore selectors (1)',
  testCss,
	'div[data-size="calc(3*3)"]{}',
);

test(
	'should ignore selectors (2)',
  testCss,
	'div:nth-child(2n + calc(3*3)){}',
);

test(
	'should reduce calc in selectors when `selectors` option is set to true (1)',
  testCss,
	'div[data-size="calc(3*3)"]{}',
	'div[data-size="9"]{}',
	{ selectors: true }
);

test(
	'should reduce calc in selectors when `selectors` option is set to true (2)',
  testCss,
	'div:nth-child(2n + calc(3*3)){}',
	'div:nth-child(2n + 9){}',
	{ selectors: true }
);

test(
  'should not reduce 100% to 1 (reduce-css-calc#44)',
  testCss,
  '.@supports (width:calc(100% - constant(safe-area-inset-left))){.a{width:calc(100% - constant(safe-area-inset-left))}}',
);

test(
  'should not break css variables that have "calc" in their names',
  testCss,
  'a{transform: translateY(calc(-100% - var(--tooltip-calculated-offset)))}',
);

test(
  'should handle complex calculations (reduce-css-calc#45) (1)',
  testValue,
  'calc(100% + (2 * 100px) - ((75.37% - 63.5px) - 900px))',
  'calc(100% + 200px - 75.37% + 963.5px)',
);

test(
  'should handle complex calculations (reduce-css-calc#45) (2)',
  testValue,
  'calc(((((100% + (2 * 30px) + 63.5px) / 0.7537) - (100vw - 60px)) / 2) + 30px)',
  'calc(((100% + 123.5px)/0.7537 - 100vw + 60px)/2 + 30px)',
);

test(
  'should handle advanced arithmetic (1)',
  testValue,
  'calc(((75.37% - 63.5px) - 900px) + (2 * 100px))',
  'calc(75.37% - 763.5px)',
);

test(
  'should handle advanced arithmetic (2)',
  testValue,
  'calc((900px - (10% - 63.5px)) + (2 * 100px))',
  'calc(1163.5px - 10%)',
);

test(
	'should handle nested calc statements (reduce-css-calc#49)',
	testValue,
	'calc(calc(2.25rem + 2px) - 1px * 2)',
	'2.25rem',
);

test(
  'should throw an exception when attempting to divide by zero',
  testThrows,
  'calc(500px/0)',
  /Cannot divide by zero/
);

test(
  'should throw an exception when attempting to divide by unit (#1)',
  testThrows,
  'calc(500px/2px)',
  'Cannot divide by "px", number expected',
);

test(
  'nested var (reduce-css-calc#50)',
  testValue,
  'calc(var(--xxx, var(--yyy)) / 2)',
  'calc(var(--xxx, var(--yyy))/2)',
);

test(
  'should not throw an exception when unknow function exist in calc',
  testValue,
  'calc(unknown(#fff) - other-unknown(200px))',
  'calc(unknown(#fff) - other-unknown(200px))',
);

test(
  'should not throw an exception when unknow function exist in calc (#1)',
  testValue,
  'calc(unknown(#fff) * other-unknown(200px))',
  'calc(unknown(#fff)*other-unknown(200px))',
);
