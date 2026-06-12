export type Node = import("../node.js").Node;
export type Sum = import("../node.js").Sum;
export type SumTerm = import("../node.js").SumTerm;
export type SimplifyFn = import("../simplify.js").SimplifyFn;
export type UnitBucket = import("./bucket.js").UnitBucket;
/**
 * @typedef {import('../node.js').Node} Node
 * @typedef {import('../node.js').Sum} Sum
 * @typedef {import('../node.js').SumTerm} SumTerm
 * @typedef {import('../simplify.js').SimplifyFn} SimplifyFn
 * @typedef {import('./bucket.js').UnitBucket} UnitBucket
 */
/**
 * @param {Sum} sum
 * @param {SimplifyFn} simplify
 * @return {Node}
 */
export function simplifySum(sum: Sum, simplify: SimplifyFn): Node;
