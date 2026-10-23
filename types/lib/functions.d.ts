import { addTypes, failureType, isFailure, isPercentage, numberType, percentageType, unknownType } from './types.js';
export type Node = import('./node.js').Node;
export type CalculationType = import('./types.js').CalculationType;
export type MathSimplifier = (args: Node[], name: string) => Node;
export type TypeAnalyzer = (args: CalculationType[], nodes: Node[]) => CalculationType;
export type MathFunction = {
    analyze: TypeAnalyzer;
    simplify?: MathSimplifier;
    isKeyword?: (node: Node, index: number) => boolean;
    calculation?: boolean;
};
/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./types.js').CalculationType} CalculationType */
/** @typedef {(args: Node[], name: string) => Node} MathSimplifier */
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
/** @param {string} value @return {boolean} */
declare function hasPotentialMathFunction(value: string): boolean;
/**
 * Token-level counterpart of `hasPotentialMathFunction`: whether any function
 * token names a supported math function, as the scanner would find it. Math
 * functions inside `url()` and similar are part of another token.
 *
 * @param {import('@csstools/css-tokenizer').CSSToken[]} tokens
 * @param {number} [start] First token to inspect.
 * @param {number} [end] One past the last token to inspect (half-open).
 * @return {boolean}
 */
declare function hasMathFunctionToken(tokens: import('@csstools/css-tokenizer').CSSToken[], start?: number, end?: number): boolean;
/**
 * The supported math function named by the function token at `index`, or
 * `undefined` when that token is not a supported math function.
 *
 * @param {import('@csstools/css-tokenizer').CSSToken[]} tokens
 * @param {number} index
 * @return {ReturnType<typeof lookupMathFunction>}
 */
declare function mathFunctionAt(tokens: import('@csstools/css-tokenizer').CSSToken[], index: number): ReturnType<typeof lookupMathFunction>;
export { addTypes, failureType, hasMathFunctionToken, hasPotentialMathFunction, isCalculationFunction, isFailure, isPercentage, lookupMathFunction, mathFunctionAt, mathFunctions, numberType, percentageType, QUICK_MATH_TEST, unknownType, };
