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
export type MathSimplifier = (name: string, args: Node[]) => Node;
export type TypeAnalyzer = (args: CalculationType[], nodes: Node[]) => CalculationType;
export type MathFunction = {
    analyze: TypeAnalyzer;
    simplify?: MathSimplifier;
    isKeyword?: (node: Node, index: number) => boolean;
    calculation?: boolean;
};
/** @param {CalculationType} type @return {boolean} */
declare function isFailure(type: CalculationType): boolean;
/** @param {CalculationType} a @param {CalculationType} b @return {CalculationType} */
declare function addTypes(a: CalculationType, b: CalculationType): CalculationType;
declare const mathFunctions: Map<string, MathFunction>;
/**
 * @param {string} name
 * @return {{normalizedName: string, definition: MathFunction} | undefined}
 */
declare function lookupMathFunction(name: string): {
    normalizedName: string;
    definition: MathFunction;
} | undefined;
declare const QUICK_MATH_TEST: RegExp;
/** @param {string} name @return {boolean} */
declare function isCalculationFunction(name: string): boolean;
/** @param {string} name @return {boolean} */
declare function isSupportedMathFunction(name: string): boolean;
/** @param {string} value @return {boolean} */
declare function hasPotentialMathFunction(value: string): boolean;
export { addTypes, mathFunctions, lookupMathFunction, QUICK_MATH_TEST, isFailure, isCalculationFunction, isSupportedMathFunction, hasPotentialMathFunction, };
