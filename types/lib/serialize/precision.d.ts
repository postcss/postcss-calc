export type Node = import('../node.js').Node;
export type Num = import('../node.js').Num;
export type Dim = import('../node.js').Dim;
export type SerializeSession = {
    buffer: string[];
    precision: number | false;
    scalarPolicy: 'standard' | 'unwrap-all';
};
/**
 * @typedef {import('../node.js').Node} Node
 * @typedef {import('../node.js').Num} Num
 * @typedef {import('../node.js').Dim} Dim
 * @typedef {object} SerializeSession
 * @property {string[]} buffer
 * @property {number | false} precision
 * @property {'standard' | 'unwrap-all'} scalarPolicy
 */
declare const NOISE_FLOOR = 1e-12;
/**
 * Divide a decimal digit string by 10^k, rounding half away from zero, and
 * return the resulting integer digit string. `digits` has no leading zeros.
 * @param {string} digits
 * @param {number} k
 * @return {string}
 */
declare function divideByPowerOfTen(digits: string, k: number): string;
/**
 * Round the shortest decimal representation of a non-negative double to `p`
 * fractional digits, half away from zero.
 *
 * `Number(text + 'e' + p)` reads the exact intended decimal (so `1.005` at
 * precision 2 becomes `1.01`), but it is only exact while the shifted value
 * fits in `Number.MAX_SAFE_INTEGER`; beyond that the intermediate double
 * rounds and can move the rounding boundary (e.g. `312834450754803.44` at
 * precision 1 or 6 drifted to `312834450754803.5`). Round the decimal digits
 * directly instead.
 *
 * @param {number} abs
 * @param {number} p
 * @return {number}
 */
declare function roundDecimal(abs: number, p: number): number;
/**
 * @param {number} v
 * @param {number | false} prec
 * @return {number}
 */
declare function round(v: number, prec: number | false): number;
/** @param {number} v @return {boolean} */
declare function isDegenerate(v: number): boolean;
/** @param {number} v @return {string} */
declare function degenerateKeyword(v: number): string;
/** @param {number} v @return {string} */
declare function serializeNumber(v: number): string;
/**
 * @param {import('../node.js').Num | import('../node.js').Dim} node
 * @param {number | false} precision
 * @param {number} [value]
 * @return {number}
 */
declare function roundedScalarValue(node: import('../node.js').Num | import('../node.js').Dim, precision: number | false, value?: number): number;
/**
 * @param {import('../node.js').Num | import('../node.js').Dim} node
 * @param {string[]} buffer
 * @param {number} value
 * @return {void}
 */
declare function emitRoundedScalar(node: import('../node.js').Num | import('../node.js').Dim, buffer: string[], value: number): void;
/**
 * @param {import('../node.js').Num | import('../node.js').Dim} node
 * @param {SerializeSession} session
 * @param {number} [value]
 * @return {number}
 */
declare function emitFiniteScalar(node: import('../node.js').Num | import('../node.js').Dim, session: SerializeSession, value?: number): number;
/**
 * @param {import('../node.js').Num | import('../node.js').Dim} node
 * @param {SerializeSession} session
 * @param {number} [value]
 * @return {void}
 */
declare function emitScalar(node: import('../node.js').Num | import('../node.js').Dim, session: SerializeSession, value?: number): void;
/**
 * @param {string[]} buffer
 * @param {import('../node.js').Num | import('../node.js').Dim} node
 * @return {void}
 */
declare function emitSignedZero(buffer: string[], node: import('../node.js').Num | import('../node.js').Dim): void;
/** @param {Node} node @return {node is import('../node.js').Num | import('../node.js').Dim} */
declare function isScalar(node: Node): node is import('../node.js').Num | import('../node.js').Dim;
/** @param {Node} node @return {node is import('../node.js').Num | import('../node.js').Dim} */
declare function isSignedZero(node: Node): node is import('../node.js').Num | import('../node.js').Dim;
/**
 * Whether a scalar node is strictly negative after precision rounding
 * (excluding signed zero and sub-precision values that round to zero).
 * @param {Node} node
 * @param {number | false} precision
 * @return {node is import('../node.js').Num | import('../node.js').Dim}
 */
declare function isEffectivelyNegative(node: Node, precision: number | false): node is import('../node.js').Num | import('../node.js').Dim;
export { NOISE_FLOOR, divideByPowerOfTen, roundDecimal, round, isDegenerate, degenerateKeyword, serializeNumber, roundedScalarValue, emitRoundedScalar, emitFiniteScalar, emitScalar, emitSignedZero, isScalar, isSignedZero, isEffectivelyNegative, };
