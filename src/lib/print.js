import { serializeResult } from './serialize.js';

/** @typedef {import('../reduce.js').ResolvedReduceCalcOptions} ResolvedReduceCalcOptions */
/** @typedef {import('../reduce.js').Replacement} Replacement */
/** @typedef {import('./serialize.js').SerializeOptions} SerializeOptions */

/**
 * @param {string} value
 * @param {Replacement} replacement
 * @param {ResolvedReduceCalcOptions} options
 * @param {SerializeOptions} serializeOptions
 * @return {string}
 */
function serializeReplacement(value, replacement, options, serializeOptions) {
  let text;
  try {
    text = serializeResult(replacement.result, serializeOptions);
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Error');
    const original =
      replacement.result.original ??
      value.slice(replacement.start, replacement.end);
    options.onParseError?.(err, original);
    text = original;
  }
  if (
    options.warnWhenCannotResolve &&
    replacement.result.status === 'unresolved'
  ) {
    options.onWarn?.('Could not reduce expression: ' + value);
  }
  return text;
}

/**
 * Serialize compiled candidates and splice the resulting text into the
 * original source. Replacements are already non-overlapping because the
 * finder treats a supported outer function as one range.
 *
 * @param {string} value
 * @param {Replacement[]} replacements
 * @param {ResolvedReduceCalcOptions} options
 * @param {SerializeOptions} serializeOptions
 * @return {string}
 */
function applyReplacements(value, replacements, options, serializeOptions) {
  if (replacements.length === 1) {
    const replacement = replacements[0];
    const text = serializeReplacement(
      value,
      replacement,
      options,
      serializeOptions
    );
    return (
      value.slice(0, replacement.start) + text + value.slice(replacement.end)
    );
  }

  let output = '';
  let lastIndex = 0;
  for (const replacement of replacements) {
    const text = serializeReplacement(
      value,
      replacement,
      options,
      serializeOptions
    );
    output += value.slice(lastIndex, replacement.start) + text;
    lastIndex = replacement.end;
  }
  return output + value.slice(lastIndex);
}

export { applyReplacements };
