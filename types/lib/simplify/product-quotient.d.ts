export type Node = import('../node.js').Node;
export type ProductFactor = import('../node.js').ProductFactor;
/**
 * @param {{exponent: 1 | -1, value: number}[]} chain
 * @return {number}
 */
declare function chainValue(chain: {
    exponent: 1 | -1;
    value: number;
}[]): number;
/**
 * Whether the opaque factors are a single Sum of only Num/Dim terms.
 * @param {ProductFactor[]} opaque
 * @return {boolean}
 */
declare function isScalarSum(opaque: ProductFactor[]): boolean;
/**
 * Whether a folded quotient prints exactly. A quotient distributed over a
 * scalar Sum is judged term by term, so `(3px + 6em) / 3` still folds.
 * @param {number} value
 * @param {ProductFactor[]} opaque
 * @param {boolean} distributable
 * @param {number | false} precision
 * @return {boolean}
 */
declare function foldsExactly(value: number, opaque: ProductFactor[], distributable: boolean, precision: number | false): boolean;
/**
 * Emit an inexact quotient as `numerator * dims * opaque / denominator`, with
 * integer parts reduced by their gcd. A lone Dim absorbs the numerator.
 * @param {number} numerator
 * @param {number} denominator
 * @param {{value: number, unit: string, rawUnit?: string} | null} loneDim
 * @param {{exponent: 1 | -1, value: number, unit: string, rawUnit?: string}[]} dims
 * @param {ProductFactor[]} opaque
 * @param {number | false} precision
 * @return {Node | null} null when a part would be rounded on output
 */
declare function rationalProduct(numerator: number, denominator: number, loneDim: {
    value: number;
    unit: string;
    rawUnit?: string;
} | null, dims: {
    exponent: 1 | -1;
    value: number;
    unit: string;
    rawUnit?: string;
}[], opaque: ProductFactor[], precision: number | false): Node | null;
export { chainValue, foldsExactly, isScalarSum, rationalProduct };
