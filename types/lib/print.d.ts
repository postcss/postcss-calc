export type ResolvedReduceCalcOptions = import('../reduce.js').ResolvedReduceCalcOptions;
export type Replacement = import('../reduce.js').Replacement;
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
declare function applyReplacements(value: string, replacements: Replacement[], options: ResolvedReduceCalcOptions): string;
export { applyReplacements };
