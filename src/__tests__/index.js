import { test } from 'uvu';
import * as assert from 'uvu/assert';
import postcss from 'postcss';

import reduceCalc from '../../dist';

const postcssOpts =  { from: undefined };

function testValue(name, fixture, expected, opts = {}) {
  fixture = `foo{bar:${fixture}}`;
  expected = `foo{bar:${expected}}`;
  
  test(name, async () => {
    const result = await postcss(reduceCalc(opts)).process(fixture, postcssOpts);
    assert.equal(result.css, expected);
  });
}

function testCss(name, fixture, expected, opts = {}) {
  test(name, async () => {
    const result = await postcss(reduceCalc(opts)).process(fixture, postcssOpts);
    assert.equal(result.css, expected);
  });
}

function testThrows(name, fixture, expected, warning, opts = {}) {
  fixture = `foo{bar:${fixture}}`;
  expected = `foo{bar:${expected}}`;

  test(name, async () => {
    const result = await postcss(reduceCalc(opts)).process(fixture, postcssOpts);
    const warnings = result.warnings();
    assert.equal(result.css, expected)
    assert.is(warnings[0].text, warning);
  });
}


testValue(
  'should reduce simple calc (1)',
  'calc(1px + 1px)',
  '2px',
);

testValue(
  'should reduce simple calc (2)',
  'calc(1px + 1px);baz:calc(2px+3px)',
  '2px;baz:5px',
);

testValue(
  'should reduce simple calc (3)',
  'calc(1rem * 1.5)',
  '1.5rem',
);

testValue(
  'should reduce simple calc (4)',
  'calc(3em - 1em)',
  '2em',
);

testValue(
  'should reduce simple calc (5',
  'calc(2ex / 2)',
  '1ex',
);

testValue(
  'should reduce simple calc (6)',
  'calc(50px - (20px - 30px))',
  '60px',
);

testValue(
  'should reduce simple calc (7)',
  'calc(100px - (100px - 100%))',
  '100%',
);

testValue(
  'should reduce simple calc (8)',
  'calc(100px + (100px - 100%))',
  'calc(200px - 100%)',
);

testValue(
  'should reduce additions and subtractions (1)',
  'calc(100% - 10px + 20px)',
  'calc(100% + 10px)',
);

testValue(
  'should reduce additions and subtractions (2)',
  'calc(100% + 10px - 20px)',
  'calc(100% - 10px)',
);

testValue(
  'should reduce additions and subtractions (3)',
  'calc(1px - (2em + 3%))',
  'calc(1px - 2em - 3%)',
);

testValue(
  'should reduce additions and subtractions (4)',
  'calc((100vw - 50em) / 2)',
  'calc(50vw - 25em)',
);

testValue(
  'should reduce additions and subtractions (5)',
  'calc(10px - (100vw - 50em) / 2)',
  'calc(10px - 50vw + 25em)',
);

testValue(
  'should reduce additions and subtractions (6)',
  'calc(1px - (2em + 4vh + 3%))',
  'calc(1px - 2em - 4vh - 3%)',
);

testValue(
  'should reduce additions and subtractions (7)',
  'calc(0px - (24px - (var(--a) - var(--b)) / 2 + var(--c)))',
  'calc(-24px + var(--a)/2 - var(--b)/2 - var(--c))',
);

testValue(
  'should reduce additions and subtractions (8)',
  'calc(1px + (2em + (3vh + 4px)))',
  'calc(5px + 2em + 3vh)',
);

testValue(
  'should reduce additions and subtractions (9)',
  'calc(1px - (2em + 4px - 6vh) / 2)',
  'calc(-1px - 1em + 3vh)',
);

testValue(
  'should reduce multiplication',
  'calc(((var(--a) + 4px) * 2) * 2)',
  'calc(var(--a)*2*2 + 16px)',
);

testValue(
  'should reduce multiplication before reducing additions',
  'calc(((var(--a) + 4px) * 2) * 2 + 4px)',
  'calc(var(--a)*2*2 + 20px)',
);

testValue(
  'should reduce division',
  'calc(((var(--a) + 4px) / 2) / 2)',
  'calc(var(--a)/2/2 + 1px)',
);

testValue(
  'should reduce division before reducing additions',
  'calc(((var(--a) + 4px) / 2) / 2 + 4px)',
  'calc(var(--a)/2/2 + 5px)',
);

testValue(
  'should ignore value surrounding calc function (1)',
  'a calc(1px + 1px)',
  'a 2px',
);


testValue(
  'should ignore value surrounding calc function (2)',
  'calc(1px + 1px) a',
  '2px a',
);

testValue(
  'should ignore value surrounding calc function (3)',
  'a calc(1px + 1px) b',
  'a 2px b',
);

testValue(
  'should ignore value surrounding calc function (4)',
  'a calc(1px + 1px) b calc(1em + 2em) c',
  'a 2px b 3em c',
);

testValue(
  'should reduce nested calc',
  'calc(100% - calc(50% + 25px))',
  'calc(50% - 25px)',
);

testValue(
  'should reduce vendor-prefixed nested calc',
  '-webkit-calc(100% - -webkit-calc(50% + 25px))',
  '-webkit-calc(50% - 25px)',
);

testValue(
  'should reduce uppercase calc (1)',
  'CALC(1px + 1px)',
  '2px',
);

testValue(
  'should reduce uppercase calc (2)',
  'CALC(1px + CALC(2px / 2))',
  '2px',
);

testValue(
  'should reduce uppercase calc (3)',
  '-WEBKIT-CALC(1px + 1px)',
  '2px',
);

testValue(
  'should reduce uppercase calc (4)',
  '-WEBKIT-CALC(1px + -WEBKIT-CALC(2px / 2))',
  '2px',
);

testValue(
  'should ignore calc with css variables (1)',
  'calc(var(--mouseX) * 1px)',
  'calc(var(--mouseX)*1px)',
);

testValue(
  'should ignore calc with css variables (2)',
  'calc(10px - (100px * var(--mouseX)))',
  'calc(10px - 100px*var(--mouseX))',
);

testValue(
  'should ignore calc with css variables (3)',
  'calc(10px - (100px + var(--mouseX)))',
  'calc(-90px - var(--mouseX))',
);

testValue(
  'should ignore calc with css variables (4)',
  'calc(10px - (100px / var(--mouseX)))',
  'calc(10px - 100px/var(--mouseX))',
);

testValue(
  'should ignore calc with css variables (5)',
  'calc(10px - (100px - var(--mouseX)))',
  'calc(-90px + var(--mouseX))',
);

testValue(
  'should ignore calc with css variables (6)',
  'calc(var(--popupHeight) / 2)',
  'calc(var(--popupHeight)/2)',
);

testValue(
  'should ignore calc with css variables (7)',
  'calc(var(--popupHeight) / 2 + var(--popupWidth) / 2)',
  'calc(var(--popupHeight)/2 + var(--popupWidth)/2)',
);


testValue(
  'should reduce calc with newline characters',
  'calc(\n1rem \n* 2 \n* 1.5)',
  '3rem',
);

testValue(
  'should preserve calc with incompatible units',
  'calc(100% + 1px)',
  'calc(100% + 1px)',
);

testValue(
  'should parse fractions without leading zero',
  'calc(2rem - .14285em)',
  'calc(2rem - 0.14285em)',
);

testValue(
  'should handle precision correctly (1)',
  'calc(1/100)',
  '0.01',
);

testValue(
  'should handle precision correctly (2)',
  'calc(5/1000000)',
  '0.00001',
);

testValue(
  'should handle precision correctly (3)',
  'calc(5/1000000)',
  '0.000005',
  { precision: 6 }
);

testValue(
  'should reduce browser-prefixed calc (1)',
  '-webkit-calc(1px + 1px)',
  '2px',
);

testValue(
  'should reduce browser-prefixed calc (2)',
  '-moz-calc(1px + 1px)',
  '2px',
);

testValue(
  'should discard zero values (#2) (1)',
  'calc(100vw / 2 - 6px + 0px)',
  'calc(50vw - 6px)',
);

testValue(
  'should discard zero values (#2) (2)',
  'calc(500px - 0px)',
  '500px',
);


testValue(
  'should not perform addition on unitless values (#3)',
  'calc(1px + 1)',
  'calc(1px + 1)',
);

testValue(
  'should reduce consecutive substractions (#24) (1)',
  'calc(100% - 120px - 60px)',
  'calc(100% - 180px)',
);

testValue(
  'should reduce consecutive substractions (#24) (2)',
  'calc(100% - 10px - 20px)',
  'calc(100% - 30px)',
);

testValue(
  'should reduce mixed units of time (postcss-calc#33)',
  'calc(1s - 50ms)',
  '0.95s',
);

testValue(
  'should correctly reduce calc with mixed units (cssnano#211)',
  'calc(99.99% * 1/1 - 0rem)',
  '99.99%',
);

testValue(
  'should apply optimization (cssnano#320)',
  'calc(50% + (5em + 5%))',
  'calc(55% + 5em)',
);

testValue(
  'should reduce substraction from zero',
  'calc( 0 - 10px)',
  '-10px',
);

testValue(
  'should reduce subtracted expression from zero',
  'calc( 0 - calc(1px + 1em) )',
  'calc(-1px - 1em)',
);

testValue(
  'should reduce substracted expression from zero (1)',
  'calc( 0 - (100vw - 10px) / 2 )',
  'calc(-50vw + 5px)',
);

testValue(
  'should reduce substracted expression from zero (2)',
  'calc( 0px - (100vw - 10px))',
  'calc(10px - 100vw)',
);

testValue(
  'should reduce substracted expression from zero (3)',
  'calc( 0px - (100vw - 10px) * 2 )',
  'calc(20px - 200vw)',
);

testValue(
  'should reduce substracted expression from zero (4)',
  'calc( 0px - (100vw + 10px))',
  'calc(-10px - 100vw)',
);

testValue(
  'should reduce substracted expression from zero (css-variable)',
  'calc( 0px - (var(--foo, 4px) / 2))',
  'calc(0px - var(--foo, 4px)/2)',
);

testValue(
  'should reduce nested expression',
  'calc( (1em - calc( 10px + 1em)) / 2)',
  '-5px',
);

testValue(
  'should skip constant function',
  'calc(constant(safe-area-inset-left))',
  'calc(constant(safe-area-inset-left))',
);

testValue(
  'should skip env function',
  'calc(env(safe-area-inset-left))',
  'calc(env(safe-area-inset-left))',
);

testValue(
  'should skip env function (#1)',
  'calc(env(safe-area-inset-left, 50px 20px))',
  'calc(env(safe-area-inset-left, 50px 20px))',
);

testValue(
  'should skip unknown function',
  'calc(unknown(safe-area-inset-left))',
  'calc(unknown(safe-area-inset-left))',
);

testCss(
  'should preserve the original declaration when `preserve` option is set to true',
  'foo{bar:calc(1rem * 1.5)}',
  'foo{bar:1.5rem;bar:calc(1rem * 1.5)}',
  { preserve: true }
);

testValue(
  'should not yield warnings when nothing is wrong',
  'calc(500px - 0px)',
  '500px',
  { warnWhenCannotResolve: true }
);

testValue(
  'should warn when calc expression cannot be reduced to a single value',
  'calc(100% + 1px)',
  'calc(100% + 1px)',
  { warnWhenCannotResolve: true },
);

testValue(
  'should reduce mixed units of time (#33)',
  'calc(1s - 50ms)',
  '0.95s',
);

testCss(
  'should not parse variables as calc expressions (#35)',
  'foo:nth-child(2n + $var-calc){}',
  'foo:nth-child(2n + $var-calc){}',
  { selectors: true }
);

testValue(
  'should apply algebraic reduction (cssnano#319)',
  'calc((100px - 1em) + (-50px + 1em))',
  '50px',
);

testValue(
  'should discard zero values (reduce-css-calc#2) (1)',
  'calc(100vw / 2 - 6px + 0px)',
  'calc(50vw - 6px)',
);

testValue(
  'should discard zero values (reduce-css-calc#2) (2)',
  'calc(500px - 0px)',
  '500px',
);

testValue(
  'should not perform addition on unitless values (reduce-css-calc#3)',
  'calc(1px + 1)',
  'calc(1px + 1)',
);

testCss(
  'should return the same and not thrown an exception for attribute selectors without a value',
  'button[disabled]{}',
  'button[disabled]{}',
  { selectors: true }
);

testCss(
  'should ignore reducing custom property',
  ':root { --foo: calc(var(--bar) / 8); }',
  ':root { --foo: calc(var(--bar)/8); }',
);


testCss(
  'should ignore media queries',
  '@media (min-width:calc(10px+10px)){}',
  '@media (min-width:calc(10px+10px)){}',
);

testCss(
  'should reduce calc in media queries when `mediaQueries` option is set to true',
  '@media (min-width:calc(10px+10px)){}',
  '@media (min-width:20px){}',
  { mediaQueries: true }
);

testCss(
  'should ignore selectors (1)',
  'div[data-size="calc(3*3)"]{}',
  'div[data-size="calc(3*3)"]{}',
);

testCss(
  'should ignore selectors (2)',
  'div:nth-child(2n + calc(3*3)){}',
  'div:nth-child(2n + calc(3*3)){}',
);

testCss(
  'should reduce calc in selectors when `selectors` option is set to true (1)',
  'div[data-size="calc(3*3)"]{}',
  'div[data-size="9"]{}',
  { selectors: true }
);

testCss(
  'should reduce calc in selectors when `selectors` option is set to true (2)',
  'div:nth-child(2n + calc(3*3)){}',
  'div:nth-child(2n + 9){}',
  { selectors: true }
);

testCss(
  'should not reduce 100% to 1 (reduce-css-calc#44)',
  '.@supports (width:calc(100% - constant(safe-area-inset-left))){.a{width:calc(100% - constant(safe-area-inset-left))}}',
  '.@supports (width:calc(100% - constant(safe-area-inset-left))){.a{width:calc(100% - constant(safe-area-inset-left))}}',
);

testCss(
  'should not break css variables that have "calc" in their names',
  'a{transform: translateY(calc(-100% - var(--tooltip-calculated-offset)))}',
  'a{transform: translateY(calc(-100% - var(--tooltip-calculated-offset)))}',
);

testValue(
  'should handle complex calculations (reduce-css-calc#45) (1)',
  'calc(100% + (2 * 100px) - ((75.37% - 63.5px) - 900px))',
  'calc(24.63% + 1163.5px)',
);

testValue(
  'should handle complex calculations (reduce-css-calc#45) (2)',
  'calc(((((100% + (2 * 30px) + 63.5px) / 0.7537) - (100vw - 60px)) / 2) + 30px)',
  'calc(66.33939% + 141.92915px - 50vw)',
);

testValue(
  'should handle advanced arithmetic (1)',
  'calc(((75.37% - 63.5px) - 900px) + (2 * 100px))',
  'calc(75.37% - 763.5px)',
);

testValue(
  'should handle advanced arithmetic (2)',
  'calc((900px - (10% - 63.5px)) + (2 * 100px))',
  'calc(1163.5px - 10%)',
);

testValue(
  'should handle nested calc statements (reduce-css-calc#49)',
  'calc(calc(2.25rem + 2px) - 1px * 2)',
  '2.25rem',
);

testThrows(
  'should throw an exception when attempting to divide by zero',
  'calc(500px/0)',
  'calc(500px/0)',
  'Cannot divide by zero'
);

testThrows(
  'should throw an exception when attempting to divide by unit (#1)',
  'calc(500px/2px)',
  'calc(500px/2px)',
  'Cannot divide by "px", number expected',
);

testValue(
  'nested var (reduce-css-calc#50)',
  'calc(var(--xxx, var(--yyy)) / 2)',
  'calc(var(--xxx, var(--yyy))/2)',
);

testValue(
  'should not throw an exception when unknow function exist in calc',
  'calc(unknown(#fff) - other-unknown(200px))',
  'calc(unknown(#fff) - other-unknown(200px))',
);

testValue(
  'should not throw an exception when unknow function exist in calc (#1)',
  'calc(unknown(#fff) * other-unknown(200px))',
  'calc(unknown(#fff)*other-unknown(200px))',
);

testValue(
  'should not strip calc with single CSS custom variable',
  'calc(var(--foo))',
  'calc(var(--foo))',
);

testValue(
  'should strip unnecessary calc with single CSS custom variable',
  'calc(calc(var(--foo)))',
  'calc(var(--foo))',
);

testValue(
  'should not strip calc with single CSS custom variables and value',
  'calc(var(--foo) + 10px)',
  'calc(var(--foo) + 10px)',
);

testValue(
  'should reduce calc (uppercase)',
  'CALC(1PX + 1PX)',
  '2PX',
);

testValue(
  'should reduce calc (uppercase) (#1)',
  'CALC(VAR(--foo) + VAR(--bar))',
  'CALC(VAR(--foo) + VAR(--bar))',
);

testValue(
  'should reduce calc (uppercase) (#2)',
  'CALC( (1EM - CALC( 10PX + 1EM)) / 2)',
  '-5PX',
);

testValue(
  'should handle nested calc function (#1)',
  'calc(calc(var(--foo) + var(--bar)) + var(--baz))',
  'calc(var(--foo) + var(--bar) + var(--baz))',
);

testValue(
  'should handle nested calc function (#2)',
  'calc(var(--foo) + calc(var(--bar) + var(--baz)))',
  'calc(var(--foo) + var(--bar) + var(--baz))',
);

testValue(
  'should handle nested calc function (#3)',
  'calc(calc(var(--foo) - var(--bar)) - var(--baz))',
  'calc(var(--foo) - var(--bar) - var(--baz))',
);

testValue(
  'should handle nested calc function (#4)',
  'calc(var(--foo) - calc(var(--bar) - var(--baz)))',
  'calc(var(--foo) - var(--bar) + var(--baz))',
);

testValue(
  'should handle nested calc function (#5)',
  'calc(calc(var(--foo) + var(--bar)) - var(--baz))',
  'calc(var(--foo) + var(--bar) - var(--baz))',
);

testValue(
  'should handle nested calc function (#6)',
  'calc(var(--foo) + calc(var(--bar) - var(--baz)))',
  'calc(var(--foo) + var(--bar) - var(--baz))',
);

testValue(
  'should handle nested calc function (#7)',
  'calc(calc(var(--foo) - var(--bar)) + var(--baz))',
  'calc(var(--foo) - var(--bar) + var(--baz))',
);

testValue(
  'should handle nested calc function (#8)',
  'calc(var(--foo) - calc(var(--bar) + var(--baz)))',
  'calc(var(--foo) - var(--bar) - var(--baz))',
);

testValue(
  'should handle nested calc function (#9)',
  'calc(calc(var(--foo) + var(--bar)) * var(--baz))',
  'calc((var(--foo) + var(--bar))*var(--baz))',
);

testValue(
  'should handle nested calc function (#10)',
  'calc(var(--foo) * calc(var(--bar) + var(--baz)))',
  'calc(var(--foo)*(var(--bar) + var(--baz)))',
);

testValue(
  'should handle nested calc function (#11)',
  'calc(calc(var(--foo) + var(--bar)) / var(--baz))',
  'calc((var(--foo) + var(--bar))/var(--baz))',
);

testValue(
  'should handle nested calc function (#12)',
  'calc(var(--foo) / calc(var(--bar) + var(--baz)))',
  'calc(var(--foo)/(var(--bar) + var(--baz)))',
);

testValue(
  'should handle nested calc function (#13)',
  'calc(100vh - 5rem - calc(10rem + 100px))',
  'calc(100vh - 15rem - 100px)',
);

testValue(
  'should handle nested calc function (#14)',
  'calc(100% - calc(10px + 2vw))',
  'calc(100% - 10px - 2vw)',
);

testValue(
  'should handle nested calc function (#15)',
  'calc(100% - calc(10px - 2vw))',
  'calc(100% - 10px + 2vw)',
);

testValue(
  'precision for calc',
  'calc(100% / 3 * 3)',
  '100%',
);

testValue(
  'precision for nested calc',
  'calc(calc(100% / 3) * 3)',
  '100%',
);

testValue(
  'plus sign',
  'calc(+100px + +100px)',
  '200px',
);

testValue(
  'plus sign (#1)',
  'calc(+100px - +100px)',
  '0px',
);

testValue(
  'plus sign (#2)',
  'calc(200px * +1)',
  '200px',
);

testValue(
  'plus sign (#3)',
  'calc(200px / +1)',
  '200px',
);

testValue(
  'minus sign',
  'calc(-100px + -100px)',
  '-200px',
);

testValue(
  'minus sign (#2)',
  'calc(-100px - -100px)',
  '0px',
);

testValue(
  'minus sign (#3)',
  'calc(200px * -1)',
  '-200px',
);

testValue(
  'minus sign (#4)',
  'calc(200px / -1)',
  '-200px',
);

testValue(
  'whitespace',
  'calc( 100px + 100px )',
  '200px',
);

testValue(
  'whitespace (#1)',
  'calc(\t100px\t+\t100px\t)',
  '200px',
);

testValue(
  'whitespace (#2)',
  'calc(\n100px\n+\n100px\n)',
  '200px',
);

testValue(
  'whitespace (#4)',
  'calc(\r\n100px\r\n+\r\n100px\r\n)',
  '200px',
);

testValue(
  'comments',
  'calc(/*test*/100px/*test*/ + /*test*/100px/*test*/)',
  '200px',
);

testValue(
  'comments (#1)',
  'calc(/*test*/100px/*test*/*/*test*/2/*test*/)',
  '200px',
);

testValue(
  'comments nested',
  'calc(/*test*/100px + calc(/*test*/100px/*test*/ + /*test*/100px/*test*/))',
  '300px',
);

testValue(
  'exponent composed',
  'calc(1.1e+1px + 1.1e+1px)',
  '22px',
);

testValue(
  'exponent composed (#1)',
  'calc(10e+1px + 10e+1px)',
  '200px',
);

testValue(
  'exponent composed (#2)',
  'calc(1.1e+10px + 1.1e+10px)',
  '22000000000px',
);

testValue(
  'exponent composed (#3)',
  'calc(9e+1 * 1px)',
  '90px',
);

testValue(
  'exponent composed (#4)',
  'calc(9e+1% + 10%)',
  '100%',
);

testValue(
  'exponent composed (uppercase)',
  'calc(1.1E+1px + 1.1E+1px)',
  '22px',
);

testValue(
  'convert units',
  'calc(1cm + 1px)',
  '1.02646cm',
);

testValue(
  'convert units (#1)',
  'calc(1px + 1cm)',
  '38.79528px',
);

testValue(
  'convert units (#2)',
  'calc(10Q + 10Q)',
  '20Q',
);

testValue(
  'convert units (#3)',
  'calc(100.9q + 10px)',
  '111.48333q',
);

testValue(
  'convert units (#4)',
  'calc(10px + 100.9q)',
  '105.33858px',
);

testValue(
  'convert units (#5)',
  'calc(10cm + 1px)',
  '10.02646cm',
);

testValue(
  'convert units (#6)',
  'calc(10mm + 1px)',
  '10.26458mm',
);

testValue(
  'convert units (#7)',
  'calc(10px + 1q)',
  '10.94488px'
);

testValue(
  'convert units (#8)',
  'calc(10cm + 1q)',
  '10.025cm'
);

testValue(
  'convert units (#9)',
  'calc(10mm + 1q)',
  '10.25mm'
);

testValue(
  'convert units (#10)',
  'calc(10in + 1q)',
  '10.00984in'
);

testValue(
  'convert units (#11)',
  'calc(10pt + 1q)',
  '10.70866pt'
);

testValue(
  'convert units (#12)',
  'calc(10pc + 1q)',
  '10.05906pc'
);

testValue(
  'convert units (#13)',
  'calc(1q + 10px)',
  '11.58333q'
);

testValue(
  'convert units (#14)',
  'calc(1q + 10cm)',
  '401q'
);

testValue(
  'convert units (#15)',
  'calc(1q + 10mm)',
  '41q'
);

testValue(
  'convert units (#16)',
  'calc(1q + 10in)',
  '1017q'
);

testValue(
  'convert units (#17)',
  'calc(1q + 10pt)',
  '15.11111q'
);

testValue(
  'convert units (#18)',
  'calc(1q + 10pc)',
  '170.33333q'
);

testValue(
  'unknown units',
  'calc(1unknown + 2unknown)',
  'calc(1unknown + 2unknown)'
);

testValue(
  'unknown units with known',
  'calc(1unknown + 2px)',
  'calc(1unknown + 2px)'
);

testValue(
  'unknown units with known (#1)',
  'calc(1px + 2unknown)',
  'calc(1px + 2unknown)'
);

testThrows(
  'error with parsing',
  'calc(10pc + unknown)',
  'calc(10pc + unknown)',
  'Lexical error on line 1: Unrecognized text.\n\n  Erroneous area:\n1: 10pc + unknown\n^.........^'
);

test.run();
