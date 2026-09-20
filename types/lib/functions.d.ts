export type Node = import('./node.js').Node;
export type CalculationType = {
    kind: 'number';
} | {
    kind: 'dimension';
    base: string | null;
} | {
    kind: 'unknown';
    percent?: true;
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
/** @typedef {import('./node.js').Node} Node */
/**
 * `percent` marks a value that resolves in the same percentage context as its
 * peers (a pure percentage). It is only produced at leaves, by abs(), and by
 * homogeneous sums and calls — never by a product, where an unpaired
 * percentage could no longer cancel against anything.
 * @typedef {{kind: 'number'} | {kind: 'dimension', base: string | null} | {kind: 'unknown', percent?: true} | {kind: 'failure'}} CalculationType
 */
/** @typedef {(name: string, args: Node[]) => Node} MathSimplifier */
/** @typedef {(args: CalculationType[], nodes: Node[]) => CalculationType} TypeAnalyzer */
/** @typedef {{analyze: TypeAnalyzer, simplify?: MathSimplifier, isKeyword?: (node: Node, index: number) => boolean, calculation?: boolean}} MathFunction */
/** @type {CalculationType} */ declare const numberType: CalculationType;
/** @type {CalculationType} */ declare const unknownType: CalculationType;
/** @type {CalculationType} */ declare const percentageType: CalculationType;
/** @type {CalculationType} */ declare const failureType: CalculationType;
/** @param {CalculationType} type @return {boolean} */
declare function isFailure(type: CalculationType): boolean;
/** @param {CalculationType} type @return {boolean} */
declare function isPercentage(type: CalculationType): boolean;
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
export { addTypes, failureType, hasPotentialMathFunction, isCalculationFunction, isFailure, isPercentage, isSupportedMathFunction, lookupMathFunction, mathFunctions, numberType, percentageType, QUICK_MATH_TEST, unknownType, };
