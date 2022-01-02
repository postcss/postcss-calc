export default pluginCreator;
/**
 * @param {{precision?: number | false,
 *          preserve?: boolean,
 *          warnWhenCannotResolve?: boolean,
 *          mediaQueries?: boolean,
 *          selectors?: boolean}} opts
 */
declare function pluginCreator(opts: {
    precision?: number | false;
    preserve?: boolean;
    warnWhenCannotResolve?: boolean;
    mediaQueries?: boolean;
    selectors?: boolean;
}): {
    postcssPlugin: string;
    /**
     * @param {import('postcss').Root} css
     * @param {{result: import('postcss').Result}} helpers
     */
    OnceExit(css: import('postcss').Root, { result }: {
        result: import('postcss').Result;
    }): void;
};
declare namespace pluginCreator {
    const postcss: boolean;
}
