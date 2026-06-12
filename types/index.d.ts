export = pluginCreator;
/**
 * @type {import('postcss').PluginCreator<PluginOptions>}
 * @param {PluginOptions} [opts]
 * @return {import('postcss').Plugin}
 */
declare function pluginCreator(opts?: PluginOptions): import("postcss").Plugin;
declare namespace pluginCreator {
    export { postcss, PluginOptions, ResolvedOptions };
}
declare var postcss: true;
type PluginOptions = {
    precision?: number | false | undefined;
    preserve?: boolean | undefined;
    warnWhenCannotResolve?: boolean | undefined;
    mediaQueries?: boolean | undefined;
    selectors?: boolean | undefined;
    /**
     * Invoked when parse/simplify throws. Replaces the default `result.warn`.
     */
    onParseError?: ((error: Error, input: string) => void) | undefined;
};
type ResolvedOptions = Required<Omit<PluginOptions, "onParseError">> & Pick<PluginOptions, "onParseError">;
