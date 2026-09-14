export type Candidate = {
    name: string;
    start: number;
    end: number;
    rootSpelling: string;
    sliceStart: number;
    sliceEnd: number;
    closed: boolean;
};
/**
 * @typedef {object} Candidate
 * @property {string} name
 * @property {number} start
 * @property {number} end
 * @property {string} rootSpelling
 * @property {number} sliceStart
 * @property {number} sliceEnd
 * @property {boolean} closed
 */
/**
 * Find complete supported math-function ranges. A supported function is
 * treated as one candidate even when parsing it later fails, so nested
 * calculations cannot produce partial output for an invalid outer function.
 *
 * @param {string} value
 * @param {import('@csstools/css-tokenizer').CSSToken[]} tokens
 * @param {import('./block-index.js').BlockIndex} index
 * @return {Candidate[]}
 */
declare function findCalculations(value: string, tokens: import('@csstools/css-tokenizer').CSSToken[], index: import('./block-index.js').BlockIndex): Candidate[];
export { findCalculations };
