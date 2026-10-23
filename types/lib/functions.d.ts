import { addTypes, failureType, isFailure, isPercentage, numberType, percentageType, unknownType } from './types.js';
export type Node = import('./node.js').Node;
export type CalculationType = import('./types.js').CalculationType;
export type MathSimplifier = (name: string, args: Node[]) => Node;
export type TypeAnalyzer = (args: CalculationType[], nodes: Node[]) => CalculationType;
export type MathFunction = {
    analyze: TypeAnalyzer;
    simplify?: MathSimplifier;
    isKeyword?: (node: Node, index: number) => boolean;
    calculation?: boolean;
};
/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./types.js').CalculationType} CalculationType */
/** @typedef {(name: string, args: Node[]) => Node} MathSimplifier */
/** @typedef {(args: CalculationType[], nodes: Node[]) => CalculationType} TypeAnalyzer */
/** @typedef {{analyze: TypeAnalyzer, simplify?: MathSimplifier, isKeyword?: (node: Node, index: number) => boolean, calculation?: boolean}} MathFunction */
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
/**
 * Token-level counterpart of `hasPotentialMathFunction`: whether any function
 * token names a supported math function, as the scanner would find it. Math
 * functions inside `url()` and similar are part of another token.
 *
 * @param {import('@csstools/css-tokenizer').CSSToken[]} tokens
 * @return {boolean}
 */
declare function hasMathFunctionToken(tokens: import('@csstools/css-tokenizer').CSSToken[]): boolean;
export { addTypes, failureType, hasMathFunctionToken, hasPotentialMathFunction, isCalculationFunction, isFailure, isPercentage, isSupportedMathFunction, lookupMathFunction, mathFunctions, numberType, percentageType, QUICK_MATH_TEST, unknownType, };
