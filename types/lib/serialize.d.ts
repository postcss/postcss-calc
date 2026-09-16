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
 * @param {{tree: Node, status: 'resolved' | 'unresolved', rootName: string, rootSpelling: string, calculation?: boolean, original?: string}} result
 * @param {SerializeOptions} [opts]
 * @return {string}
 */
declare function serializeResult(result: {
    tree: Node;
    status: 'resolved' | 'unresolved';
    rootName: string;
    rootSpelling: string;
    calculation?: boolean;
    original?: string;
}, opts?: SerializeOptions): string;
export { serialize, serializeResult };
