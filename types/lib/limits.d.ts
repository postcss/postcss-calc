/** @typedef {import('./node.js').Node} Node */
export type Node = import('./node.js').Node;
declare const MAX_CALCULATION_DEPTH = 1024;
/** @param {number} depth @return {void} */
declare function assertDepth(depth: number): void;
/** @param {Node} node @param {number} [depth] @return {void} */
declare function checkCalculationDepth(node: Node, depth?: number): void;
export { MAX_CALCULATION_DEPTH, assertDepth, checkCalculationDepth };
