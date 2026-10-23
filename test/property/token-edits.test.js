// Property tests for token lists edited after tokenization. An earlier token
// is replaced with one tokenized from new text, so its source offsets are
// stale while its type, raw text and value agree. The edited list must reduce
// to what the string reducer gives for the edited text.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { tokenize } from '@csstools/css-tokenizer';
import reduceCalc from 'postcss-calc/reduce';
import reduceTokens from 'postcss-calc/reduce-tokens';
import { cssMathSourceArb } from '../helpers/css-math-arbitraries.js';
import { NUM_RUNS } from '../helpers/laws.js';
import { applyReplacements, raw } from '../helpers/reduce-list.js';

const prefixArb = fc.constantFrom('a', 'bb', 'ccc', 'dddd', 'x\\61 y');

describe('reduceTokens: edited token lists', () => {
  test('replacing an earlier token matches reduceCalc on the edited text', () => {
    fc.assert(
      fc.property(
        prefixArb,
        prefixArb,
        cssMathSourceArb,
        (before, after, source) => {
          const tokens = tokenize({ css: `${before} ${source}` });
          tokens[0] = tokenize({ css: after })[0];
          const edited = raw(applyReplacements(tokens, reduceTokens(tokens)));
          const expected = reduceCalc(`${after} ${source}`);
          assert.equal(edited, expected);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
