/** @typedef {import('../reduce.js').ReduceCalcOptions} ReduceCalcOptions */
/** @typedef {import('../reduce.js').ResolvedReduceCalcOptions} ResolvedReduceCalcOptions */

/**
 * @param {ReduceCalcOptions} [opts]
 * @return {ResolvedReduceCalcOptions}
 */
function resolveOptions(opts) {
  return {
    warnWhenCannotResolve: false,
    unwrapSingleNegativeNumber: false,
    unwrapSingleValue: false,
    ...opts,
    // An explicit `precision: undefined` keeps the default.
    precision: opts?.precision ?? 5,
  };
}

export { resolveOptions };
