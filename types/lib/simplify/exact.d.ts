/**
 * A value is exact at `precision` when rounding it for output loses nothing
 * beyond float noise.
 * @param {number} value
 * @param {number | false} precision
 * @return {boolean}
 */
declare function isExact(value: number, precision: number | false): boolean;
export { isExact };
