export type PluginOptions = {
    precision?: number | false;
    preserve?: boolean;
    warnWhenCannotResolve?: boolean;
    mediaQueries?: boolean;
    selectors?: boolean;
    /**
     * Invoked when parse/simplify throws. Replaces the default `result.warn`.
     */
    onParseError?: (error: Error, input: string) => void;
};
export type ResolvedOptions = Required<Omit<PluginOptions, 'onParseError'>> & Pick<PluginOptions, 'onParseError'>;
/**
 * @param {PluginOptions} [opts]
 * @return {import('postcss').Plugin}
 */
declare function pluginCreator(opts?: PluginOptions): import('postcss').Plugin;
declare namespace pluginCreator {
    var postcss: boolean;
}
declare const _default: import('postcss').PluginCreator<PluginOptions>;
export default _default;
export { pluginCreator as 'module.exports' };
