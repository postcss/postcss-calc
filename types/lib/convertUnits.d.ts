export type BaseType = 'length' | 'angle' | 'time' | 'frequency' | 'resolution' | 'flex' | 'percentage';
/**
 * @param {string} unit
 * @return {BaseType | null}
 */
declare function baseOf(unit: string): BaseType | null;
/**
 * Convert a value within a single conversion family. Returns null when
 * either unit is missing from the table (em/rem/vw need runtime context)
 * or when the units belong to different base types.
 * @param {number} value
 * @param {string} from
 * @param {string} to
 * @return {number | null}
 */
declare function convert(value: number, from: string, to: string): number | null;
/**
 * Return a base type only for units present in the static conversion table.
 * Units with context-dependent values (em, rem, vw, etc.) return null.
 * @param {string} unit
 * @return {BaseType | null}
 */
declare function staticBaseOf(unit: string): BaseType | null;
export { baseOf, staticBaseOf, convert };
