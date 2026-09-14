import { TokenType as CssType } from '@csstools/css-tokenizer';
import { isCalculationFunction, isSupportedMathFunction } from './functions.js';

/**
 * @typedef {object} Candidate
 * @property {string} name
 * @property {number} start
 * @property {number} end
 * @property {string} rootSpelling
 * @property {number} sliceStart
 * @property {number} sliceEnd
 * @property {boolean} closed
 */

/**
 * Find complete supported math-function ranges. A supported function is
 * treated as one candidate even when parsing it later fails, so nested
 * calculations cannot produce partial output for an invalid outer function.
 *
 * @param {string} value
 * @param {import('@csstools/css-tokenizer').CSSToken[]} tokens
 * @param {import('./block-index.js').BlockIndex} index
 * @return {Candidate[]}
 */
function findCalculations(value, tokens, index) {
  /** @type {Candidate[]} */
  const candidates = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token[0] !== CssType.Function) continue;

    const name = token[4].value;
    const isCalc = isCalculationFunction(name);
    const isMath = !isCalc && isSupportedMathFunction(name);
    if (!isCalc && !isMath) continue;

    const close = index.closeOf(i, tokens.length);
    const closed = close !== -1;
    const end = closed ? tokens[close][3] + 1 : value.length;
    const sliceStart = isCalc ? i + 1 : i;
    const sliceEnd = closed ? close + (isCalc ? 0 : 1) : tokens.length - 1;
    candidates.push({
      name,
      start: token[2],
      end,
      rootSpelling: value.slice(token[2], token[3]),
      sliceStart,
      sliceEnd,
      closed,
    });
    if (!closed) break;
    i = close;
  }
  return candidates;
}

export { findCalculations };
