/** @typedef {import('../reduce.js').ReduceCalcOptions} ReduceCalcOptions */
/** @typedef {import('../reduce.js').ResolvedReduceCalcOptions} ResolvedReduceCalcOptions */
export type ReduceCalcOptions = import('../reduce.js').ReduceCalcOptions;
export type ResolvedReduceCalcOptions = import('../reduce.js').ResolvedReduceCalcOptions;
/**
 * @param {ReduceCalcOptions} [opts]
 * @return {ResolvedReduceCalcOptions}
 */
declare function resolveOptions(opts?: ReduceCalcOptions): ResolvedReduceCalcOptions;
export { resolveOptions };
