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
export type ResolvedReduceCalcOptions = Required<Omit<ReduceCalcOptions, 'onParseError' | 'onWarn'>> & Pick<ReduceCalcOptions, 'onParseError' | 'onWarn'>;
export type TransformContext = {
    options: ResolvedReduceCalcOptions;
    value: string;
    tokens: import('@csstools/css-tokenizer').CSSToken[];
};
export type Replacement = {
    start: number;
    end: number;
    result: CalculationResult;
};
export type CalculationResult = {
    tree: import('./lib/node.js').Node;
    status: 'resolved' | 'unresolved';
    rootName: string;
    rootSpelling: string;
    calculation: boolean;
    original: string | undefined;
};
/**
 * @typedef {object} ReduceCalcOptions
 * @property {number | false} [precision]
 * @property {boolean} [warnWhenCannotResolve]
 * @property {boolean} [unwrapSingleNegativeNumber] Deprecated alias for `unwrapSingleValue`.
 * @property {boolean} [unwrapSingleValue] Serialize fully resolved finite scalar results without calculation syntax. Defaults to `false`.
 * @property {(error: Error, input: string) => void} [onParseError] Invoked when parse/simplify throws.
 * @property {(message: string) => void} [onWarn] Invoked when `warnWhenCannotResolve` is set and an expression cannot be reduced to a single value.
 */
/** @typedef {Required<Omit<ReduceCalcOptions, 'onParseError' | 'onWarn'>> & Pick<ReduceCalcOptions, 'onParseError' | 'onWarn'>} ResolvedReduceCalcOptions */
/**
 * Fields threaded through the internal token-range walk.
 *
 * @typedef {object} TransformContext
 * @property {ResolvedReduceCalcOptions} options
 * @property {string} value
 * @property {import('@csstools/css-tokenizer').CSSToken[]} tokens
 */
/**
 * @typedef {object} Replacement
 * @property {number} start
 * @property {number} end
 * @property {CalculationResult} result
 */
/**
 * @typedef {object} CalculationResult
 * @property {import('./lib/node.js').Node} tree
 * @property {'resolved' | 'unresolved'} status
 * @property {string} rootName
 * @property {string} rootSpelling
 * @property {boolean} calculation
 * @property {string | undefined} original
 */
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
