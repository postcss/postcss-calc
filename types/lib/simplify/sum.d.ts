export type Node = import('../node.js').Node;
export type Sum = import('../node.js').Sum;
export type SumTerm = import('../node.js').SumTerm;
export type SimplifyFn = import('../simplify.js').SimplifyFn;
export type UnitBucket = import('./bucket.js').UnitBucket;
/**
 * @param {Sum} sum
 * @param {SimplifyFn} simplify
 * @param {number | false} [precision]
 * @return {Node}
 */
declare function simplifySum(sum: Sum, simplify: SimplifyFn, precision?: number | false): Node;
export { simplifySum };
