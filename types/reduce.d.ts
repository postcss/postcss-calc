export type ReduceCalcOptions = {
    precision?: number | false;
    warnWhenCannotResolve?: boolean;
    /**
     * Deprecated alias for `unwrapSingleValue`.
     */
    unwrapSingleNegativeNumber?: boolean;
    /**
     * Serialize fully resolved finite scalar results without calculation syntax. Defaults to `false`.
     */
    unwrapSingleValue?: boolean;
    /**
     * Invoked when parse/simplify throws.
     */
    onParseError?: (error: Error, input: string) => void;
    /**
     * Invoked when `warnWhenCannotResolve` is set and an expression cannot be reduced to a single value.
     */
    onWarn?: (message: string) => void;
};
export type ReduceDiagnostics = Pick<ReduceCalcOptions, 'onParseError' | 'onWarn'>;
export type ResolvedReduceCalcOptions = Required<Omit<ReduceCalcOptions, 'onParseError' | 'onWarn'>>;
export type TextSink = import('./lib/serialize/text-sink.js').TextSink;
/**
 * @typedef {object} ReduceCalcOptions
 * @property {number | false} [precision]
 * @property {boolean} [warnWhenCannotResolve]
 * @property {boolean} [unwrapSingleNegativeNumber] Deprecated alias for `unwrapSingleValue`.
 * @property {boolean} [unwrapSingleValue] Serialize fully resolved finite scalar results without calculation syntax. Defaults to `false`.
 * @property {(error: Error, input: string) => void} [onParseError] Invoked when parse/simplify throws.
 * @property {(message: string) => void} [onWarn] Invoked when `warnWhenCannotResolve` is set and an expression cannot be reduced to a single value.
 */
/**
 * The callbacks of `ReduceCalcOptions`. A reducer call receives them apart from
 * the options that shape the result.
 *
 * @typedef {Pick<ReduceCalcOptions, 'onParseError' | 'onWarn'>} ReduceDiagnostics
 */
/** @typedef {Required<Omit<ReduceCalcOptions, 'onParseError' | 'onWarn'>>} ResolvedReduceCalcOptions */
/** @typedef {import('./lib/serialize/text-sink.js').TextSink} TextSink */
/**
 * Simplify every supported CSS math function in a component-value string.
 * Text outside those functions is preserved byte-for-byte.
 *
 * @param {string} value
 * @param {ReduceCalcOptions} [opts]
 * @return {string}
 */
declare function reduceCalc(value: string, opts?: ReduceCalcOptions): string;
export default reduceCalc;
