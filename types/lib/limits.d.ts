export type Node = import('./node.js').Node;
/** @typedef {import('./node.js').Node} Node */
declare const MAX_CALCULATION_DEPTH = 1024;
declare class CalculationLimitError extends Error {
    limit: number;
    /** @param {number} limit */
    constructor(limit: number);
}
/** @param {number} depth @return {void} */
declare function assertDepth(depth: number): void;
/** @param {Node} node @param {number} [depth] @return {void} */
declare function checkCalculationDepth(node: Node, depth?: number): void;
export { MAX_CALCULATION_DEPTH, CalculationLimitError, assertDepth, checkCalculationDepth, };
