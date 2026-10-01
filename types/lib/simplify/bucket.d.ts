export type UnitBucket = {
    unit: string;
    rawUnit?: string;
    total: number;
    /**
     * largest |term| accumulated into `total`, for noise detection
     */
    scale: number;
    base: import('../convertUnits.js').BaseType | null;
};
/**
 * @typedef {object} UnitBucket
 * @property {string} unit
 * @property {string} [rawUnit]
 * @property {number} total
 * @property {number} scale largest |term| accumulated into `total`, for noise detection
 * @property {import('../convertUnits.js').BaseType | null} base
 */
/** Mutates `buckets` in place — totals of survivor buckets accumulate the
 *  converted values of merged neighbors. Caller must not reuse the input.
 * @param {UnitBucket[]} buckets
 * @param {number | false} [precision] A conversion that is not exact at this
 *   precision is not merged. When only the reverse direction is exact, the
 *   survivor switches to the other bucket's unit.
 * @return {UnitBucket[]}
 */
declare function mergeConvertibleBuckets(buckets: UnitBucket[], precision?: number | false): UnitBucket[];
export { mergeConvertibleBuckets };
