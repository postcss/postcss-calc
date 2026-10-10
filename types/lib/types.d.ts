/**
 * `percent` marks a value that resolves in the same percentage context as its
 * peers (a pure percentage). It is only produced at leaves, by abs(), and by
 * homogeneous sums and calls — never by a product, where an unpaired
 * percentage could no longer cancel against anything.
 * @typedef {{kind: 'number'} | {kind: 'dimension', base: string | null} | {kind: 'unknown', percent?: true} | {kind: 'failure'}} CalculationType
 */
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
/**
 * Check an all-number function without assuming anything about an unresolved
 * operand. A concrete dimension can never become a number, so it is still a
 * definite error when another argument is opaque.
 * @param {CalculationType[]} args
 * @param {number} min
 * @param {number} max
 * @return {CalculationType}
 */
declare function numberArguments(args: CalculationType[], min: number, max: number): CalculationType;
/**
 * Check values that must share a calculation type. Unknown operands remain
 * unknown: they might resolve to the concrete type required by their peers.
 * @param {CalculationType[]} args
 * @param {number} min
 * @param {number} max
 * @return {CalculationType}
 */
declare function matchingArguments(args: CalculationType[], min: number, max: number): CalculationType;
export { addTypes, failureType, isFailure, isPercentage, matchingArguments, numberArguments, numberType, percentageType, unknownType, };
