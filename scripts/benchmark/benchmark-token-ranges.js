// Token-range benchmark. One long token list is reduced as many small
// `[start, end)` ranges, the way an editor reduces each declaration in place.
// Each call pays for its own block matching, so the cost should grow with
// the range, not with the length of the whole list. In-process and single
// run: a profiling hint, not a gate (see BENCHMARKS.md).
import { tokenize } from '@csstools/css-tokenizer';
import { createReducer } from '../../src/reduce-tokens.js';

const SIZES = [2_000, 4_000, 8_000, 16_000];
const RANGE_TEXT = 'calc(1px + 2px)';
// The tokenizer appends an EOF token, which is not part of any range.
const RANGE_TOKENS = tokenize({ css: RANGE_TEXT }).length - 1;
const REPEATS = 3;

const reduce = createReducer();
const target = { warn() {} };

/** @param {number} count @return {import('@csstools/css-tokenizer').CSSToken[]} */
function listOf(count) {
  return tokenize({ css: RANGE_TEXT.repeat(count) });
}

/**
 * Reduce each range in turn and return the best of a few runs, in ms.
 *
 * @param {import('@csstools/css-tokenizer').CSSToken[]} tokens
 * @param {number} count
 * @return {number}
 */
function timeRanges(tokens, count) {
  let best = Infinity;
  for (let repeat = 0; repeat < REPEATS; repeat++) {
    const start = performance.now();
    for (let range = 0; range < count; range++) {
      const from = range * RANGE_TOKENS;
      reduce(tokens, target, from, from + RANGE_TOKENS);
    }
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

console.log('ranges  list-tokens  ms (best of ' + REPEATS + ')  ms per range');
for (const count of SIZES) {
  const tokens = listOf(count);
  const ms = timeRanges(tokens, count);
  console.log(
    String(count).padStart(6),
    String(tokens.length).padStart(11),
    ms.toFixed(2).padStart(18),
    (ms / count).toFixed(5).padStart(14)
  );
}
