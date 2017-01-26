import reduceCalc from '..';
import postcss from 'postcss';
import assert from 'assert';
import assign from 'object-assign';

function test(input, output, opts) {
  opts = assign({}, opts);

  let result = postcss(reduceCalc(opts)).process(input);
  assert.equal(output, result.css);

  return result;
}

test('foo{bar:calc(1px + 1px);baz:bat}', 'foo{bar:2px;baz:bat}');
test('foo{bar:calc(1px + 1px);baz:calc(2px+3px)}', 'foo{bar:2px;baz:5px}');
test('foo{bar:calc(\n1rem \n* 2 \n* 1.5)}', 'foo{bar:3rem}');
test('foo{bar:calc(1rem * 1.5)}', 'foo{bar:1.5rem}');
test('foo{bar:calc(100% + 1px)}', 'foo{bar:calc(100% + 1px)}');
test('foo{bar:calc((100px - 1em) + (-50px + 1em))}', 'foo{bar:50px}');
test('foo{bar:calc(50% + (5em + 5%))}', 'foo{bar:calc(55% + 5em)}');
test('foo{bar:calc(500px - 0px)}', 'foo{bar:500px}');
test('foo{bar:calc(100vw / 2 - 6px + 0px)}', 'foo{bar:calc(50vw - 6px)}');
test('foo{bar:calc(1s - 50ms)}', 'foo{bar:0.95s}');
test('foo{bar:calc(99.99% * 1/1 - 0rem)}', 'foo{bar:99.99%}');
test('foo{bar:calc(1px + 1)}', 'foo{bar:calc(1px + 1)}');
test('foo{bar:calc(1/100)}', 'foo{bar:0.01}');
test('foo{bar:calc(5/1000000)}', 'foo{bar:0.00001}');
test('foo{bar:calc(5/1000000)}', 'foo{bar:0.000005}', { precision: 6 });
test('@media (min-width:calc(10px+10px)){}', '@media (min-width:calc(10px+10px)){}');
test('@media (min-width:calc(10px+10px)){}', '@media (min-width:20px){}', { mediaQueries: true });
test('div[data-size="calc(3*3)"]{}', 'div[data-size="calc(3*3)"]{}');
test('div:nth-child(2n + calc(3*3)){}', 'div:nth-child(2n + calc(3*3)){}');
test('div[data-size="calc(3*3)"]{}', 'div[data-size="9"]{}', { selectors: true});
test('div:nth-child(2n + calc(3*3)){}', 'div:nth-child(2n + 9){}', { selectors: true});
test('foo{bar:calc(1rem * 1.5)}', 'foo{bar:1.5rem;bar:calc(1rem * 1.5)}', { preserve: true });
test('foo:nth-child(2n + $var-calc){}', 'foo:nth-child(2n + $var-calc){}');
assert.equal(0, test(
  'foo{bar:calc(500px - 0px)}',
  'foo{bar:500px}',
  { warnWhenCannotResolve: true }).messages.length
);
assert.ok(
  test(
    'foo{bar:calc(100% + 1px)}',
    'foo{bar:calc(100% + 1px)}',
    { warnWhenCannotResolve: true }
  ).messages[0].text.match(/^Could not reduce expression:/),
  "should add a warning for unreduced calc() "
);
assert.ok(
  test(
    'foo{bar:calc(100vw / 2 - 6px + 0px)}',
    'foo{bar:calc(50vw - 6px)}',
    { warnWhenCannotResolve: true }
  ).messages[0].text.match(/^Could not reduce expression:/),
  "should add a warning for unreduced calc() "
);
test(
  'foo{font-size: calc(14px + 6 * ((100vw - 320px) / 448))}',
  'foo{font-size: calc(9.71px + 1.34vw)}',
  { precision: 2 });
assert.throws(() => test('foo{bar:calc(500px/0)}'), /Cannot divide by zero/);
assert.throws(() => test('foo{bar:calc(500px/2px)}'), /Cannot divide by "px", number expected/);
