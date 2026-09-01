export type TransformValueOptions = {
    precision?: number | false;
    warnWhenCannotResolve?: boolean;
    /**
     * Invoked when parse/simplify throws.
     */
    onParseError?: (error: Error, input: string) => void;
    /**
     * Invoked when `warnWhenCannotResolve` is set and an expression cannot be reduced to a single value.
     */
    onWarn?: (message: string) => void;
};
export type ResolvedTransformOptions = Required<Omit<TransformValueOptions, 'onParseError' | 'onWarn'>> & Pick<TransformValueOptions, 'onParseError' | 'onWarn'>;
export type PostCssCalcOptions = {
    precision?: number | false;
    warnWhenCannotResolve?: boolean;
    mediaQueries?: boolean;
    selectors?: boolean;
    /**
     * Invoked when parse/simplify throws. Replaces the default `result.warn`.
     */
    onParseError?: (error: Error, input: string) => void;
};
export type ResolvedOptions = Required<Omit<PostCssCalcOptions, 'onParseError'>> & Pick<PostCssCalcOptions, 'onParseError'>;
export type TransformContext = {
    options: ResolvedTransformOptions;
    value: string;
    tokens: import('@csstools/css-tokenizer').CSSToken[];
    replacements: Replacement[];
};
export type Replacement = {
    start: number;
    end: number;
    node: import('./lib/node.js').Node;
    calcName: string;
    matchedName: string;
};
/**
 * @param {string} value
 * @param {TransformValueOptions} [opts]
 * @return {string}
 */
declare function transformValue(value: string, opts?: TransformValueOptions): string;
/**
 * @param {PostCssCalcOptions} [opts]
 * @return {import('postcss').Plugin}
 */
declare function pluginCreator(opts?: PostCssCalcOptions): import('postcss').Plugin;
declare namespace pluginCreator {
    var postcss: true;
}
declare const _default: import('postcss').PluginCreator<PostCssCalcOptions>;
export default _default;
export { transformValue as reduceCalc, pluginCreator as 'module.exports' };
