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
/** @param {Node} node @return {Analysis} */
declare function analyze(node: Node): Analysis;
export { analyze };
