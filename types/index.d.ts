declare const _exports: import("postcss").PluginCreator<PluginOptions>;
export = _exports;
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
