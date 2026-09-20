export type Node = import('./node.js').Node;
export type CalculationType = import('./functions.js').CalculationType;
export type DimensionType = Extract<CalculationType, {
    kind: 'dimension';
}>;
export type AnalysisType = 'number' | 'unknown' | {
    dimension: string | null;
};
export type Analysis = {
    type: AnalysisType;
    valid: boolean;
    unresolved: boolean;
};
export type ProductFactors = {
    valid: boolean;
    structurallyValid: boolean;
    hasUnresolved: boolean;
    numerator: DimensionType | null;
    denominator: DimensionType | null;
    hasOpaqueNumerator: boolean;
    hasOpaqueDenominator: boolean;
};
/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./functions.js').CalculationType} CalculationType */
/** @typedef {Extract<CalculationType, {kind: 'dimension'}>} DimensionType */
/** @typedef {'number' | 'unknown' | {dimension: string | null}} AnalysisType */
/** @typedef {{type: AnalysisType, valid: boolean, unresolved: boolean}} Analysis */
/**
 * @typedef {Object} ProductFactors
 * @property {boolean} valid
 * @property {boolean} structurallyValid
 * @property {boolean} hasUnresolved
 * @property {DimensionType | null} numerator
 * @property {DimensionType | null} denominator
 * @property {boolean} hasOpaqueNumerator
 * @property {boolean} hasOpaqueDenominator
 */
/**
 * Analyze the original complete tree and return its root summary. Analysis
 * validates and classifies the tree; it is not a rewrite plan.
 * @param {Node} node
 * @return {Analysis}
 */
declare function analyze(node: Node): Analysis;
export { analyze };
