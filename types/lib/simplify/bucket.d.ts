export type UnitBucket = {
    unit: string;
    total: number;
    base: import("../convertUnits.js").BaseType | null;
    order: number;
};
/**
 * @typedef {object} UnitBucket
 * @property {string} unit
 * @property {number} total
 * @property {import('../convertUnits.js').BaseType | null} base
 * @property {number} order
 */
/** Mutates `buckets` in place — totals of survivor buckets accumulate the
 *  converted values of merged neighbors. Caller must not reuse the input.
 * @param {UnitBucket[]} buckets
 * @return {UnitBucket[]}
 */
export function mergeConvertibleBuckets(buckets: UnitBucket[]): UnitBucket[];
