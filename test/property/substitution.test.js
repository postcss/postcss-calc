// Substitution functions (`var()`, `env()`, `attr()`, ...) are replaced by raw
// tokens before the value is computed. Whatever tokens a substitution
// expands to, the reduced expression must evaluate like the original.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import reduceCalc from 'postcss-calc/reduce';

const tokenArb = fc.constantFrom(
  '3',
  '-3',
  '0',
  '-1 * 2',
  '1 + 2',
  '8 / 2',
  '6 / 3 / 2',
  '2 * 3 - 1',
  '(1 + 2)',
  '7 - 4 - 2'
);
const tokensArb = fc.record({ a: tokenArb, b: tokenArb, c: tokenArb });

const { expr } = fc.letrec((tie) => ({
  leaf: fc.oneof(
    fc.integer({ min: -9, max: 9 }).map((n) => (n < 0 ? `(${n})` : String(n))),
    fc.constant('.5'),
    fc.constantFrom('var(--a)', 'var(--b)', 'var(--c)')
  ),
  expr: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    tie('leaf'),
    fc
      .tuple(tie('expr'), fc.constantFrom('+', '-', '*', '/'), tie('expr'))
      .map(([l, op, r]) => `${l} ${op} ${r}`),
    tie('expr').map((e) => `(${e})`),
    tie('expr').map((e) => `calc(${e})`)
  ),
}));

/**
 * @param {string} value
 * @param {{a: string, b: string, c: string}} tokens
 * @return {number}
 */
function evaluate(value, tokens) {
  const expression = value
    .replace(/calc\(/g, '(')
    .replace(/var\(--([abc])\)/g, (_, name) => tokens[name]);
  return Function(`"use strict"; return ${expression};`)();
}

test('property: reduced expressions evaluate like their token substitution', () => {
  fc.assert(
    fc.property(expr, tokensArb, (input, tokens) => {
      const source = `calc(${input})`;
      const output = reduceCalc(source, { precision: false });
      const expected = evaluate(source, tokens);
      if (
        !Number.isFinite(expected) ||
        /[a-z]/.test(output.replace(/calc\(|var\(--[abc]\)/g, ''))
      ) {
        return; // degenerate result, serialized as a keyword
      }
      const actual = evaluate(output, tokens);
      assert.ok(
        Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
        `${source} → ${output}: ${expected} vs ${actual} with ${JSON.stringify(tokens)}`
      );
    }),
    { numRuns: 2000 }
  );
});
