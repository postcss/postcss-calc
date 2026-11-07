// Source-grammar properties for unresolved CSS expressions.  Differential
// testing cannot be the oracle here: preserving parentheses around opaque
// sums is our explicit semantic contract.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { tokenize } from '@csstools/css-tokenizer';
import { parse } from '../../src/lib/parser.js';
import { simplify } from '../../src/lib/simplify.js';
import { serialize } from '../../src/lib/serialize.js';
import reduceCalc from 'postcss-calc/reduce';
import { out } from '../helpers/out.js';
import {
  cssMathSourceArb,
  opaqueGroupedCalcArb,
} from '../helpers/arbitraries.js';

// Sign-bearing groups around generated math: the sign must stay outside the
// group, so these are the inputs most likely to distribute it wrongly.
const signedGroupArb = fc
  .tuple(
    cssMathSourceArb,
    fc.constantFrom(
      (inner) => `calc(-1 * (${inner}))`,
      (inner) => `calc((${inner}) * -1)`,
      (inner) => `calc(${inner} - (${inner}))`
    )
  )
  .map(([source, wrap]) => wrap(source));

describe('opaque CSS math properties', () => {
  test('property: reduceCalc output re-parses and reducing it again changes nothing', () => {
    fc.assert(
      fc.property(fc.oneof(cssMathSourceArb, signedGroupArb), (input) => {
        const once = reduceCalc(input);
        const tokens = tokenize({ css: once });
        parse(tokens, 0, tokens.length);
        return reduceCalc(once) === once;
      }),
      { numRuns: 300 }
    );
  });

  test('property: bounded CSS math grammar parses and round-trips', () => {
    fc.assert(
      fc.property(cssMathSourceArb, (input) => {
        const tokens = tokenize({ css: input });
        const output = serialize(simplify(parse(tokens, 0, tokens.length)));
        const outputTokens = tokenize({ css: output });
        return (
          typeof output === 'string' &&
          parse(outputTokens, 0, outputTokens.length) !== null
        );
      }),
      { numRuns: 300 }
    );
  });

  test('property: opaque grouped sums never distribute a negative sign', () => {
    fc.assert(
      fc.property(opaqueGroupedCalcArb, ({ input, expected }) => {
        assert.equal(out(input), expected);
      }),
      { numRuns: 100 }
    );
  });
});

test('opaque grouping: nested groups and var() fallbacks preserve serialization', () => {
  assert.equal(
    out('calc(var(--a) - (var(--b) - (var(--c) + var(--d))))'),
    'calc(var(--a) - (var(--b) - (var(--c) + var(--d))))'
  );
  assert.equal(
    out('calc(-1 * (var(--a, calc(1px + 2px)) + var(--b, 4px)))'),
    'calc(-1 * (var(--a, calc(3px)) + var(--b, 4px)))'
  );
  assert.equal(
    out('calc((var(--a, calc(1px + 2px)) + var(--b, 4px)) * -1)'),
    'calc(-1 * (var(--a, calc(3px)) + var(--b, 4px)))'
  );
});
