/** @typedef {import('../reduce.js').ReduceCalcOptions} ReduceCalcOptions */
/** @typedef {import('../reduce.js').ResolvedReduceCalcOptions} ResolvedReduceCalcOptions */

/**
 * The options that shape the result. Callbacks are not part of them: they are
 * diagnostics, passed to the reducer separately.
 *
 * @param {ReduceCalcOptions} [opts]
 * @return {ResolvedReduceCalcOptions}
 */
function resolveOptions(opts) {
  return {
    warnWhenCannotResolve: opts?.warnWhenCannotResolve ?? false,
    unwrapSingleNegativeNumber: opts?.unwrapSingleNegativeNumber ?? false,
    unwrapSingleValue: opts?.unwrapSingleValue ?? false,
    // An explicit `precision: undefined` keeps the default.
    precision: opts?.precision ?? 5,
  };
}

export { resolveOptions };
