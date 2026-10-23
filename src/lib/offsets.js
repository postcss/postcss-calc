/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

/**
 * Maps a token index to the offset in the joined raw text of `tokens` where
 * that token starts, or the total length past the end. Only diagnostics need
 * offsets, and a fallback can report many of them, so the table is built on
 * the first call and each lookup after that is constant time.
 *
 * @param {CSSToken[]} tokens
 * @return {(index: number) => number}
 */
function offsetLookup(tokens) {
  /** @type {Int32Array | undefined} */
  let starts;
  return (index) => {
    if (starts === undefined) {
      starts = new Int32Array(tokens.length + 1);
      let offset = 0;
      for (let i = 0; i < tokens.length; i++) {
        starts[i] = offset;
        offset += tokens[i][1].length;
      }
      starts[tokens.length] = offset;
    }
    return starts[Math.min(index, tokens.length)];
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

/**
 * Whether `text` equals the joined raw text of `tokens[start, end)`, without
 * building that string.
 *
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @param {string} text
 * @return {boolean}
 */
function tokensMatchText(tokens, start, end, text) {
  let position = 0;
  for (let i = start; i < end; i++) {
    const raw = tokens[i][1];
    if (!text.startsWith(raw, position)) return false;
    position += raw.length;
  }
  return position === text.length;
}

export { joinTokens, offsetLookup, tokensMatchText };
