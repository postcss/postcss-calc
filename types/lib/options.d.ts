/** @typedef {import('../reduce.js').ReduceCalcOptions} ReduceCalcOptions */
/** @typedef {import('../reduce.js').ResolvedReduceCalcOptions} ResolvedReduceCalcOptions */
export type ReduceCalcOptions = import('../reduce.js').ReduceCalcOptions;
export type ResolvedReduceCalcOptions = import('../reduce.js').ResolvedReduceCalcOptions;
/**
 * The options that shape the result. Callbacks are not part of them: they are
 * diagnostics, passed to the reducer separately.
 *
 * @param {ReduceCalcOptions} [opts]
 * @return {ResolvedReduceCalcOptions}
 */
declare function resolveOptions(opts?: ReduceCalcOptions): ResolvedReduceCalcOptions;
export { resolveOptions };
