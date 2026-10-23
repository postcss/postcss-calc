/**
 * If `dims` contain exactly one numerator / one denominator pair with the
 * same base type and convertible units, return the two sides expressed in a
 * common unit, so the caller can fold them into its own numerator and
 * denominator. Otherwise return null. Used by `simplifyProduct` for typed
 * division (§10.2). More complex cancellation (e.g. `px^2 / px`) is left
 * unreduced — consumers rarely rely on it and the spec doesn't require it.
 * @param {{ exponent: 1 | -1, value: number, unit: string }[]} dims
 * @param {number | false} [precision] The denominator is converted into the
 *   numerator's unit when that is exact at this precision (`1px / 1in` →
 *   `1 / 96`); otherwise the numerator is converted (`1in / 1px` → `96 / 1`).
 * @return {{ numerator: number, denominator: number } | null}
 */
declare function tryCancelPair(dims: {
    exponent: 1 | -1;
    value: number;
    unit: string;
}[], precision?: number | false): {
    numerator: number;
    denominator: number;
} | null;
export { tryCancelPair };
