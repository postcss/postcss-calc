// The string reducer and the token reducer print through one emitter. For any
// source, the tokens of the token reducer's edited list must be those of the
// string reducer's output: same types, raw text and parsed values.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { TokenType, tokenize } from '@csstools/css-tokenizer';
import reduceCalc from 'postcss-calc/reduce';
import reduceTokens from 'postcss-calc/reduce-tokens';
import { cssMathSourceArb } from '../helpers/css-math-arbitraries.js';
import { NUM_RUNS } from '../helpers/laws.js';
import { applyReplacements, raw } from '../helpers/reduce-list.js';

const optionsArb = fc.constantFrom(
  {},
  { unwrapSingleValue: true },
  { precision: false },
  { precision: 2 }
);

// Terms the generic math generator never produces: signed zero, degenerate
// keywords, floats, escapes, opaque fallbacks with arbitrary tokens, and units
// that are unknown or contextual.
const edgeTermArb = fc.constantFrom(
  '-0',
  '-0px',
  '0px',
  '-1 * 0px',
  'infinity',
  '-infinity',
  'NaN',
  'infinity * 1px',
  '1.23456789px',
  '.5em',
  '1e21px',
  '1e-7',
  '2\\70 x',
  '3foo',
  '10%',
  'pi',
  'e',
  'var(--a, foo  bar)',
  'var(--a, /* c */ 1px)',
  'var(--a,)',
  'var(--a, [x] {y})',
  'v\\61 r(--a)',
  'env(safe-area-inset-top, 2px)',
  'attr(data-x px)'
);
const edgeOperatorArb = fc.constantFrom(' + ', ' - ', ' * ', ' / ');
const edgeExpressionArb = fc.oneof(
  edgeTermArb,
  fc
    .tuple(edgeTermArb, edgeOperatorArb, edgeTermArb)
    .map(([a, op, b]) => `${a}${op}${b}`),
  fc
    .tuple(
      edgeTermArb,
      edgeOperatorArb,
      edgeTermArb,
      edgeOperatorArb,
      edgeTermArb
    )
    .map(([a, op1, b, op2, c]) => `(${a}${op1}${b})${op2}${c}`)
);
const edgeFunctionArb = fc.oneof(
  fc
    .tuple(
      fc.constantFrom('calc', 'CALC', '-webkit-calc', '-moz-calc', 'c\\61 lc'),
      edgeExpressionArb
    )
    .map(([name, inner]) => `${name}(${inner})`),
  fc
    .tuple(
      fc.constantFrom('min', 'MAX', 'hypot'),
      edgeExpressionArb,
      edgeExpressionArb
    )
    .map(([name, a, b]) => `${name}(${a}, ${b})`),
  fc
    .tuple(edgeExpressionArb, edgeExpressionArb, edgeExpressionArb)
    .map(([a, b, c]) => `clamp(${a}, ${b}, ${c})`),
  edgeExpressionArb.map((inner) => `sin(${inner})`)
);
const contextArb = fc.constantFrom(
  '$',
  'margin: $',
  '$ $',
  'a $ b',
  'translate($, $)',
  'url(calc(1px)) $',
  '"calc(1px + 2px)" $',
  '$ !important'
);
// One or more functions inside surrounding text, such as a declaration value.
const edgeSourceArb = fc
  .tuple(contextArb, fc.array(edgeFunctionArb, { minLength: 1, maxLength: 2 }))
  .map(([context, functions]) => {
    let index = 0;
    return context.replaceAll('$', () => functions[index++ % functions.length]);
  });

/** Type, raw text and parsed value of each token, without source offsets or EOF. */
function tokenShapes(tokens) {
  return tokens
    .filter((token) => token[0] !== TokenType.EOF)
    .map((token) => [token[0], token[1], token[4]]);
}

/** Reduce `source` both ways and compare the results. */
function assertPrintersAgree(source, options) {
  const tokens = tokenize({ css: source });
  const edited = applyReplacements(tokens, reduceTokens(tokens, options));
  const output = reduceCalc(source, options);
  assert.equal(raw(edited), output);
  assert.deepEqual(tokenShapes(edited), tokenShapes(tokenize({ css: output })));
}

describe('string and token printers', () => {
  test('the edited token list has the tokens of the string reducer output', () => {
    fc.assert(fc.property(cssMathSourceArb, optionsArb, assertPrintersAgree), {
      numRuns: NUM_RUNS,
    });
  });

  test('they agree on edge terms, escapes, opaque fallbacks and surrounding text', () => {
    fc.assert(fc.property(edgeSourceArb, optionsArb, assertPrintersAgree), {
      numRuns: NUM_RUNS * 2,
    });
  });
});
