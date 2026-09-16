import { analyze } from './analyze.js';
import { MAX_CALCULATION_DEPTH, checkCalculationDepth } from './limits.js';
export type Node = import('./node.js').Node;
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
/** @typedef {import('./node.js').Node} Node */
/** @typedef {{kind: 'number'} | {kind: 'dimension', base: string | null} | {kind: 'unknown'} | {kind: 'failure'}} CalculationType */
/** @param {Node} node @return {CalculationType} */
declare function checkCalculationType(node: Node): CalculationType;
export { MAX_CALCULATION_DEPTH, checkCalculationDepth, checkCalculationType, analyze, };
