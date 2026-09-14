import { serializeResult } from './serialize.js';

/** @typedef {import('../reduce.js').ResolvedReduceCalcOptions} ResolvedReduceCalcOptions */
/** @typedef {import('../reduce.js').Replacement} Replacement */

/**
 * Serialize compiled candidates and splice the resulting text into the
 * original source. Replacements are already non-overlapping because the
 * finder treats a supported outer function as one range.
 *
 * @param {string} value
 * @param {Replacement[]} replacements
 * @param {ResolvedReduceCalcOptions} options
 * @return {string}
 */
function applyReplacements(value, replacements, options) {
  let output = '';
  let lastIndex = 0;
  for (const replacement of replacements) {
    let text;
    try {
      text = serializeResult(replacement.result, {
        precision: options.precision,
        unwrapSingleNegativeNumber: options.unwrapSingleNegativeNumber,
        unwrapSingleValue: options.unwrapSingleValue,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Error');
      options.onParseError?.(err, replacement.result.original);
      text = replacement.result.original;
    }
    if (
      options.warnWhenCannotResolve &&
      replacement.result.status === 'unresolved'
    ) {
      options.onWarn?.('Could not reduce expression: ' + value);
    }
    output += value.slice(lastIndex, replacement.start) + text;
    lastIndex = replacement.end;
  }
  return output + value.slice(lastIndex);
}

export { applyReplacements };
