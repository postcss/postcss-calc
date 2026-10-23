// Property tests for `createReducer` over a sub-range of a token list. The
// range `[start, end)` must reduce to what reducing its joined text gives,
// with the surrounding tokens left as they were. This pins the index
// arithmetic of block matching, which a range does not start at 0.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { tokenize } from '@csstools/css-tokenizer';
import reduceCalc from 'postcss-calc/reduce';
import { createReducer } from 'postcss-calc/reduce-tokens';
import { cssMathSourceArb } from '../helpers/css-math-arbitraries.js';
import { NUM_RUNS } from '../helpers/laws.js';
import { applyReplacements, raw } from '../helpers/reduce-list.js';

const sideArb = fc.constantFrom('', 'a', 'x(1px)', '(a, [b])', 'c d');
const reduce = createReducer();
const target = { warn() {} };

/** Tokens of `css` without its end-of-file token. */
function contentTokens(css) {
  return tokenize({ css }).slice(0, -1);
}

describe('createReducer: sub-range of a token list', () => {
  test('reducing [start, end) matches reducing the joined text of that range', () => {
    fc.assert(
      fc.property(
        sideArb,
        cssMathSourceArb,
        sideArb,
        (before, source, after) => {
          const head = contentTokens(`${before} `);
          const middle = contentTokens(source);
          const tail = contentTokens(` ${after}`);
          const tokens = [...head, ...middle, ...tail];
          const start = head.length;
          const end = start + middle.length;
          const replacements = reduce(tokens, target, start, end);
          const edited = raw(applyReplacements(tokens, replacements));
          const expected = `${before} ${reduceCalc(source)} ${after}`;
          assert.equal(edited, expected);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
