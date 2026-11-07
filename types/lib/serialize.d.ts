export type Node = import('./node.js').Node;
export type Sum = import('./node.js').Sum;
export type Product = import('./node.js').Product;
export type ProductFactor = import('./node.js').ProductFactor;
export type SerializeOptions = {
    /**
     * Decimal places for numbers. `false` disables rounding. Default 5.
     */
    precision?: number | false;
    /**
     * Wrapper name to use when `calc()` is needed. Default `'calc'`.
     */
    calcName?: string;
    /**
     * Deprecated alias for `unwrapSingleValue`.
     */
    unwrapSingleNegativeNumber?: boolean;
    /**
     * Serialize fully resolved finite scalar results without calculation syntax.
     */
    unwrapSingleValue?: boolean;
};
/**
 * @param {Node} node
 * @param {SerializeOptions} [opts]
 * @return {string}
 */
declare function serialize(node: Node, opts?: SerializeOptions): string;
/**
 * Print a result into `out`. An unresolved root that is not a calculation and
 * does not match its own name prints nothing.
 *
 * @param {{tree: Node, status: 'resolved' | 'unresolved', rootName: string, rootSpelling: string, calculation?: boolean}} result
 * @param {SerializeOptions} opts
 * @param {import('./serialize/sink.js').Sink} out
 * @return {boolean} Whether anything was printed.
 */
declare function printResult(result: {
    tree: Node;
    status: 'resolved' | 'unresolved';
    rootName: string;
    rootSpelling: string;
    calculation?: boolean;
}, opts: SerializeOptions, out: import('./serialize/sink.js').Sink): boolean;
/**
 * Returns `undefined` for an unresolved root that is not a calculation and
 * does not match its own name: the caller keeps the source text as it is.
 *
 * @param {Parameters<typeof printResult>[0]} result
 * @param {SerializeOptions} [opts]
 * @return {string | undefined}
 */
declare function serializeResult(result: Parameters<typeof printResult>[0], opts?: SerializeOptions): string | undefined;
export { printResult, serialize, serializeResult };
