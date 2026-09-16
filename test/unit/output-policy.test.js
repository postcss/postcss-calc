import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import reduceCalc from '../../src/reduce.js';
import plugin from '../../src/index.js';

const policies = [
  { name: 'standard', options: {} },
  { name: 'unwrapped', options: { unwrapSingleValue: true } },
];

describe('v12 output policy', () => {
  test('uses standard calculation syntax by default', () => {
    assert.equal(reduceCalc('calc(3px / 2)'), 'calc(1.5px)');
    assert.equal(reduceCalc('calc(3 / 2)'), 'calc(1.5)');
    assert.equal(reduceCalc('min(1px, 2px)'), 'calc(1px)');
  });

  test('unwraps every finite scalar when requested', () => {
    const expected = {
      standard: ['calc(2px)', 'calc(-2px)', 'calc(.5)', 'calc(-.3)'],
      unwrapped: ['2px', '-2px', '.5', '-.3'],
    };
    const inputs = [
      'calc(1px + 1px)',
      'calc(1px - 3px)',
      'calc(1 / 2)',
      'calc(-3 / 10)',
    ];
    for (const { name, options } of policies) {
      assert.deepEqual(
        inputs.map((input) => reduceCalc(input, options)),
        expected[name]
      );
    }
  });

  test('keeps edge scalar and unresolved results stable under both policies', () => {
    const expected = {
      standard: [
        'calc(0)',
        'calc(infinity)',
        'calc(infinity * 1px)',
        'calc(NaN)',
        'calc(50%)',
        'calc(1px + var(--x))',
        'SIN(var(--x))',
      ],
      unwrapped: [
        '0',
        'calc(infinity)',
        'calc(infinity * 1px)',
        'calc(NaN)',
        '50%',
        'calc(1px + var(--x))',
        'SIN(var(--x))',
      ],
    };
    const inputs = [
      'calc(-0)',
      'calc(infinity)',
      'calc(1px / 0)',
      'calc(NaN)',
      'calc(50%)',
      'calc(1px + var(--x))',
      'SIN(var(--x))',
    ];
    for (const { name, options } of policies) {
      assert.deepEqual(
        inputs.map((input) => reduceCalc(input, options)),
        expected[name]
      );
    }
  });

  test('keeps the published negative option as an unwrap alias', () => {
    assert.equal(
      reduceCalc('calc(1px + 1px)', { unwrapSingleNegativeNumber: true }),
      '2px'
    );
    assert.equal(
      reduceCalc('calc(1 / 2)', { unwrapSingleNegativeNumber: true }),
      '.5'
    );
  });

  test('threads unwrapping through opaque function contents', () => {
    const input = 'var(--x, calc(1px + 2px))';
    assert.equal(reduceCalc(input), 'var(--x, calc(3px))');
    assert.equal(
      reduceCalc(input, { unwrapSingleValue: true }),
      'var(--x, 3px)'
    );
  });

  test('preserves named-function spelling while unresolved', () => {
    const inputs = [
      'SIN(var(--x))',
      'SQRT(var(--x))',
      'POW(var(--x), 2)',
      'ROUND(var(--x), 1px)',
      'MIN(1px, var(--size))',
      'min(1px, var(--size))',
    ];
    for (const { options } of policies) {
      for (const input of inputs) {
        assert.equal(reduceCalc(input, options), input);
      }
    }
  });

  test('preserves invalid roots and emits one diagnostic', () => {
    const inputs = [
      'calc(1px + 1s)',
      'pow(1px, 2)',
      'sqrt(1px)',
      'log(1px)',
      'exp(1px)',
      'atan2(1px, 1s)',
      'hypot(1px, 1s)',
      'calc(1px * 2px * var(--x) * 3px)',
      'calc(1px / var(--x) / 1s)',
    ];
    for (const { options } of policies) {
      for (const input of inputs) {
        const errors = [];
        assert.equal(
          reduceCalc(input, {
            ...options,
            onParseError: (error, source) => errors.push([error.name, source]),
          }),
          input
        );
        assert.deepEqual(errors, [['CalculationTypeError', input]]);
      }
    }
  });

  test('accepts numeric trig inputs and strategy-form round()', () => {
    const inputs = ['sin(1)', 'cos(0)', 'tan(0)', 'round(up, 5px, 2px)'];
    for (const { options } of policies) {
      for (const input of inputs) {
        const errors = [];
        const output = reduceCalc(input, {
          ...options,
          onParseError: (error) => errors.push(error),
        });
        assert.notEqual(output, input);
        assert.deepEqual(errors, []);
      }
    }
  });

  test('keeps declaration range-sensitive results inside calc()', async () => {
    const result = await postcss(plugin()).process(
      'a{z-index:calc(1 / 2);width:calc(1px - 2px)}',
      { from: undefined }
    );
    assert.equal(result.css, 'a{z-index:calc(.5);width:calc(-1px)}');
  });

  test('allows declaration results to opt into bare values', async () => {
    const result = await postcss(plugin({ unwrapSingleValue: true })).process(
      'a{z-index:calc(1 / 2);width:calc(1px - 2px)}',
      { from: undefined }
    );
    assert.equal(result.css, 'a{z-index:.5;width:-1px}');
  });

  test('selectors force bare output', async () => {
    const result = await postcss(plugin({ selectors: true })).process(
      'a:nth-child(calc(1 + 2)){x:calc(1px + 2px)}',
      {
        from: undefined,
      }
    );
    assert.equal(result.css, 'a:nth-child(3){x:calc(3px)}');
  });

  test('preserves vendor calc spelling when a wrapper remains', () => {
    assert.equal(reduceCalc('-webkit-calc(1px + 2px)'), '-webkit-calc(3px)');
    assert.equal(
      reduceCalc('-moz-calc(1px + var(--x))'),
      '-moz-calc(1px + var(--x))'
    );
  });

  test('matches function closers through nested simple blocks', () => {
    const errors = [];
    assert.equal(
      reduceCalc('calc(var(--x, [)] ) + 1px)', {
        onParseError: (error) => errors.push(error),
      }),
      'calc(1px + var(--x, [)] ))'
    );
    assert.deepEqual(errors, []);
  });

  test('bounds nesting and reports the nesting limit', () => {
    for (const count of [1024, 1025]) {
      const input = 'calc('.repeat(count) + '1' + ')'.repeat(count);
      const errors = [];
      const output = reduceCalc(input, {
        onParseError: (error) => errors.push(error),
      });
      if (count === 1024) {
        assert.notEqual(output, input);
        assert.equal(errors.length, 0);
      } else {
        assert.equal(output, input);
        assert.equal(errors.length, 1);
        assert.match(
          errors[0].message,
          /Calculation nesting exceeds the limit of 1024/
        );
      }
    }
  });

  test('applies the nesting limit through the plugin', async () => {
    const count = 1025;
    const input =
      'a{x:' + 'calc('.repeat(count) + '1' + ')'.repeat(count) + '}';
    const errors = [];
    const result = await postcss(
      plugin({ onParseError: (error) => errors.push(error) })
    ).process(input, { from: undefined });
    assert.equal(result.css, input);
    assert.equal(errors.length, 1);
    assert.match(
      errors[0].message,
      /Calculation nesting exceeds the limit of 1024/
    );
  });
});
