export type Node = import('./node.js').Node;
/** @typedef {import('./node.js').Node} Node */
declare const MAX_CALCULATION_DEPTH = 1024;
declare class CalculationLimitError extends Error {
    limit: number;
    /** @param {number} limit */
    constructor(limit: number);
}
export type CalculationType = {
    kind: 'number';
} | {
    kind: 'dimension';
    base: string | null;
} | {
    kind: 'unknown';
} | {
    kind: 'failure';
};
/** @param {Node} node @return {CalculationType} */
declare function checkCalculationType(node: Node): CalculationType;
/** @param {Node} node @param {number} [depth] @return {void} */
declare function checkCalculationDepth(node: Node, depth?: number): void;
export { MAX_CALCULATION_DEPTH, CalculationLimitError, checkCalculationDepth, checkCalculationType, };
