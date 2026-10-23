/**
 * The source spelling of a name, or `undefined` when it has none. A name
 * that was escaped in the source keeps its raw text so it round-trips.
 *
 * @param {string} raw
 * @param {string} decoded
 * @return {string | undefined}
 */
function sourceSpelling(raw, decoded) {
  return raw === decoded ? undefined : raw;
}

export { sourceSpelling };
