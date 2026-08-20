// Source-grammar properties for unresolved CSS expressions.  Differential
// testing cannot be the oracle here: preserving parentheses around opaque
// sums is our explicit semantic contract.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { tokenize } from '../../src/lib/tokenizer.js';
import { parse } from '../../src/lib/parser.js';
import { simplify } from '../../src/lib/simplify.js';
import { serialize } from '../../src/lib/serialize.js';
import { out } from '../helpers/out.mjs';
import {
  cssMathSourceArb,
  opaqueGroupedCalcArb,
} from '../helpers/arbitraries.mjs';

describe('property: Bounded CSS', () => {
  test('property: bounded CSS math grammar parses and round-trips', () => {
    fc.assert(
      fc.property(cssMathSourceArb, (input) => {
        const output = serialize(simplify(parse(tokenize(input))));
        return typeof output === 'string' && parse(tokenize(output)) !== null;
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
    out('calc(-(var(--a, calc(1px + 2px)) + var(--b, 4px)))'),
    'calc(-(var(--a, 3px) + var(--b, 4px)))'
  );
});
