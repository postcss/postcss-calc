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
    options: ResolvedOptions;
    result: import('postcss').Result;
    item: import('postcss').ChildNode;
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
 * @param {PostCssCalcOptions} [opts]
 * @return {import('postcss').Plugin}
 */
declare function pluginCreator(opts?: PostCssCalcOptions): import('postcss').Plugin;
declare namespace pluginCreator {
    var postcss: true;
}
declare const _default: import('postcss').PluginCreator<PostCssCalcOptions>;
export default _default;
export { pluginCreator as 'module.exports' };
