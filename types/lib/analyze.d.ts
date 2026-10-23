export type Node = import('./node.js').Node;
export type CalculationType = import('./functions.js').CalculationType;
export type AnalysisType = 'number' | 'unknown' | {
    dimension: string | null;
};
export type Analysis = {
    type: AnalysisType;
    valid: boolean;
    unresolved: boolean;
};
/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./functions.js').CalculationType} CalculationType */
/** @typedef {'number' | 'unknown' | {dimension: string | null}} AnalysisType */
/** @typedef {{type: AnalysisType, valid: boolean, unresolved: boolean}} Analysis */
/**
 * Analyze the original complete tree and return its root summary. Analysis
 * validates and classifies the tree; it is not a rewrite plan.
 * @param {Node} node
 * @return {Analysis}
 */
declare function analyze(node: Node): Analysis;
export { analyze };
