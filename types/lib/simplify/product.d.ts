export type Node = import('../node.js').Node;
export type Product = import('../node.js').Product;
export type ProductFactor = import('../node.js').ProductFactor;
export type SimplifyFn = import('../simplify.js').SimplifyFn;
/**
 * @param {Product} product
 * @param {SimplifyFn} simplify
 * @param {number | false} [precision] A quotient that is not exact at this
 *   precision stays symbolic (`100% / 3`) instead of being rounded.
 * @return {Node}
 */
declare function simplifyProduct(product: Product, simplify: SimplifyFn, precision?: number | false): Node;
export { simplifyProduct };
