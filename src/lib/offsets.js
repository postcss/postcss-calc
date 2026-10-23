/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

/**
 * Maps a token index in `[start, end)` to the offset in the joined raw text of
 * that range where the token starts, or the range's total length past its end.
 * Only diagnostics need offsets, and a fallback can report many of them, so the
 * table is built on the first call and each lookup after that is constant time.
 *
 * @param {CSSToken[]} tokens
 * @param {number} [start]
 * @param {number} [end]
 * @return {(index: number) => number}
 */
function offsetLookup(tokens, start = 0, end = tokens.length) {
  /** @type {Int32Array | undefined} */
  let starts;
  return (index) => {
    if (starts === undefined) {
      starts = new Int32Array(end - start + 1);
      let offset = 0;
      for (let i = start; i < end; i++) {
        starts[i - start] = offset;
        offset += tokens[i][1].length;
      }
      starts[end - start] = offset;
    }
    return starts[Math.min(index, end) - start];
  };
}

/**
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @return {string}
 */
function joinTokens(tokens, start, end) {
  let text = '';
  for (let i = start; i < end; i++) text += tokens[i][1];
  return text;
}

export { joinTokens, offsetLookup };
