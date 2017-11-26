import ava from 'ava';
import postcss from 'postcss';

import reduceCalc from '..';

function test(message, input, output = null, opts = {}, expectedWarnings = []) {
  if (output === null)
    output = input;

  ava(message, t => {
    const out = postcss(reduceCalc(opts)).process(input);
    t.deepEqual(out.css, output);
    const warnings = out.warnings().map(warning => warning.text);
    t.deepEqual(warnings.length, expectedWarnings.length);
    warnings.forEach((warning, i) => {
      t.true(expectedWarnings[i].test(warning));
    });
  });
}

function testThrows(message, input, expected, opts = {}) {
  ava(message, t => {
    t.throws(() => postcss(reduceCalc(opts)).process(input).css, expected);
  });
}

test(
  'should reduce simple calc (1)',
  'foo{bar:calc(1px + 1px);baz:bat}',
  'foo{bar:2px;baz:bat}'
);

test(
  'should reduce simple calc (2)',
  'foo{bar:calc(1px + 1px);baz:calc(2px+3px)}',
  'foo{bar:2px;baz:5px}'
);

test(
  'should reduce simple calc (3)',
  'foo{bar:calc(1rem * 1.5)}',
  'foo{bar:1.5rem}'
);

test(
  'should reduce calc with newline characters',
  'foo{bar:calc(\n1rem \n* 2 \n* 1.5)}',
  'foo{bar:3rem}'
);

test(
  'should preserve calc with incompatible units',
  'foo{bar:calc(100% + 1px)}',
  'foo{bar:calc(100% + 1px)}'
);

test(
  'should parse fractions without leading zero',
  'foo{margin:calc(2rem - .14285em)}',
  'foo{margin:calc(2rem - 0.14285em)}'
);

test(
  'should handle precision correctly (1)',
  'foo{bar:calc(1/100)}',
  'foo{bar:0.01}'
);

test(
  'should handle precision correctly (2)',
  'foo{bar:calc(5/1000000)}',
  'foo{bar:0.00001}'
);

test(
  'should handle precision correctly (3)',
  'foo{bar:calc(5/1000000)}',
  'foo{bar:0.000005}',
  { precision: 6 }
);

test(
  'should ignore media queries',
  '@media (min-width:calc(10px+10px)){}',
  '@media (min-width:calc(10px+10px)){}'
);

test(
  'should reduce calc in media queries when `mediaQueries` option is set to true',
  '@media (min-width:calc(10px+10px)){}',
  '@media (min-width:20px){}',
   { mediaQueries: true }
);

test(
  'should ignore selectors (1)',
  'div[data-size="calc(3*3)"]{}',
  'div[data-size="calc(3*3)"]{}'
);

test(
  'should ignore selectors (2)',
  'div:nth-child(2n + calc(3*3)){}',
  'div:nth-child(2n + calc(3*3)){}'
);

test(
  'should reduce calc in selectors when `selectors` option is set to true (1)',
  'div[data-size="calc(3*3)"]{}',
  'div[data-size="9"]{}',
  { selectors: true }
);

test(
  'should reduce calc in selectors when `selectors` option is set to true (2)',
  'div:nth-child(2n + calc(3*3)){}',
  'div:nth-child(2n + 9){}',
  { selectors: true }
);

test(
  'should preserve the original declaration when `preserve` option is set to true',
  'foo{bar:calc(1rem * 1.5)}',
  'foo{bar:1.5rem;bar:calc(1rem * 1.5)}',
  { preserve: true }
);

test(
  'should not yield warnings when nothing is wrong',
  'foo{bar:calc(500px - 0px)}',
  'foo{bar:500px}',
  { warnWhenCannotResolve: true }
);

test(
  'should warn when calc expression cannot be reduced to a single value',
  'foo{bar:calc(100% + 1px)}',
  'foo{bar:calc(100% + 1px)}',
  { warnWhenCannotResolve: true },
  [ /^Could not reduce expression:/ ]
);

test(
  'should produce simpler result (#25)',
  'foo{font-size: calc(14px + 6 * ((100vw - 320px) / 448))}',
  'foo{font-size: calc(9.71px + 1.34vw)}',
  { precision: 2 }
);

test(
  'should reduce mixed units of time (#33)',
  'foo{bar:calc(1s - 50ms)}',
  'foo{bar:0.95s}'
);
test(
  'should not parse variables as calc expressions (#35)',
  'foo:nth-child(2n + $var-calc){}',
  'foo:nth-child(2n + $var-calc){}',
  { selectors: true }
);

test(
  'should correctly reduce calc with mixed units (cssnano#211)',
  'foo{bar:calc(99.99% * 1/1 - 0rem)}',
  'foo{bar:99.99%}'
);

test(
  'should apply algebraic reduction (cssnano#319)',
  'foo{bar:calc((100px - 1em) + (-50px + 1em))}',
  'foo{bar:50px}'
);

test(
  'should apply optimization (cssnano#320)',
  'foo{bar:calc(50% + (5em + 5%))}',
  'foo{bar:calc(55% + 5em)}'
);

test(
  'should discard zero values (reduce-css-calc#2) (1)',
  'foo{bar:calc(100vw / 2 - 6px + 0px)}',
  'foo{bar:calc(50vw - 6px)}'
);

test(
  'should discard zero values (reduce-css-calc#2) (2)',
  'foo{bar:calc(500px - 0px)}',
  'foo{bar:500px}'
);

test(
  'should not perform addition on unitless values (reduce-css-calc#3)',
  'foo{bar:calc(1px + 1)}',
  'foo{bar:calc(1px + 1)}'
);

testThrows(
  'should throw an exception when attempting to divide by zero',
  'foo{bar:calc(500px/0)}',
  /Cannot divide by zero/
);

testThrows(
  'should throw an exception when attempting to divide by unit',
  'foo{bar:calc(500px/2px)}',
  /Cannot divide by "px", number expected/
);

test(
  'should return the same and not thrown an exception for attribute selectors without a value',
  'button[disabled]{}',
  'button[disabled]{}',
  { selectors: true }
);

test(
  'should ignore reducing custom property',
  ':root { --foo: calc(var(--bar) / 8); }',
  ':root { --foo: calc(var(--bar) / 8); }'
)
