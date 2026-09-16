export type Candidate = {
    name: string;
    normalizedName: string;
    start: number;
    end: number;
    rootSpelling: string;
    calculation: boolean;
    sliceStart: number;
    sliceEnd: number;
    closed: boolean;
};
/**
 * @typedef {object} Candidate
 * @property {string} name
 * @property {string} normalizedName
 * @property {number} start
 * @property {number} end
 * @property {string} rootSpelling
 * @property {boolean} calculation
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
 * @param {ReturnType<typeof import('./block-index.js').indexBlocks>} index
 * @return {Candidate[]}
 */
declare function findCalculations(value: string, tokens: import('@csstools/css-tokenizer').CSSToken[], index: ReturnType<typeof import('./block-index.js').indexBlocks>): Candidate[];
export { findCalculations };
