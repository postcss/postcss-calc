// Delimiter matching for one token list. `matchBlocks` pairs every opening
// token (`Function`, `(`, `[`, `{`) with its closing token, so navigation is
// index arithmetic on the result.
import { TokenType as CssType } from '@csstools/css-tokenizer';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

/**
 * The closer of each opener in one matched range. `close[i - base]` is the
 * absolute index of the closer for the opener at token index `i`, or -1.
 * `base` is the first token index the matching covered, so a range far into a
 * long list allocates only its own length.
 *
 * @typedef {object} Blocks
 * @property {Int32Array} close
 * @property {number} base
 */

/**
 * Closing token type for each opening token type.
 *
 * @param {CssType} type
 * @return {CssType | undefined}
 */
function closerOf(type) {
  switch (type) {
    case CssType.Function:
    case CssType.OpenParen:
      return CssType.CloseParen;
    case CssType.OpenSquare:
      return CssType.CloseSquare;
    case CssType.OpenCurly:
      return CssType.CloseCurly;
  }
  return undefined;
}

/**
 * Match every block opener in `[start, end)` to its closer. Matching is LIFO:
 * a closer that does not match the innermost open block is ignored, so the
 * open stack survives the mismatch. Openers with no closer before `end` map
 * to -1, as if the range were the whole list.
 *
 * `maxDepth` is the largest number of blocks open at once. The caller decides
 * whether that exceeds the nesting limit.
 *
 * @param {CSSToken[]} tokens
 * @param {number} [start]
 * @param {number} [end]
 * @return {{blocks: Blocks, maxDepth: number}}
 */
function matchBlocks(tokens, start = 0, end = tokens.length) {
  const close = new Int32Array(Math.max(0, end - start)).fill(-1);
  /** @type {number[]} */
  const openers = [];
  /** @type {CssType[]} */
  const expected = [];
  let maxDepth = 0;
  for (let i = start; i < end; i++) {
    const type = tokens[i][0];
    const closer = closerOf(type);
    if (closer !== undefined) {
      openers.push(i);
      expected.push(closer);
      maxDepth = Math.max(maxDepth, openers.length);
      continue;
    }
    if (expected.at(-1) !== type) continue;
    close[/** @type {number} */ (openers.pop()) - start] = i;
    expected.pop();
  }
  return { blocks: { close, base: start }, maxDepth };
}

/**
 * The closer of the opener at `index`, or -1 when it has no closer or the
 * matching does not cover `index`. The result is an absolute token index.
 *
 * @param {Blocks} blocks
 * @param {number} index
 * @return {number}
 */
function closerAt(blocks, index) {
  return blocks.close[index - blocks.base] ?? -1;
}

/**
 * The closer of the opener at `index`, or -1 when it has none inside
 * `[index, end)`.
 *
 * @param {Blocks} blocks
 * @param {number} index
 * @param {number} end
 * @return {number}
 */
function closeIn(blocks, index, end) {
  const closer = closerAt(blocks, index);
  return closer !== -1 && closer < end ? closer : -1;
}

/**
 * Index after the component (a token, or a whole block) that starts at `index`,
 * never past `end`.
 *
 * @param {Blocks} blocks
 * @param {number} index
 * @param {number} end
 * @return {number}
 */
function nextComponent(blocks, index, end) {
  const closer = closeIn(blocks, index, end);
  return closer === -1 ? index + 1 : closer + 1;
}

/**
 * First comma outside every block in `[start, end)`, or -1.
 *
 * @param {CSSToken[]} tokens
 * @param {Blocks} blocks
 * @param {number} start
 * @param {number} end
 * @return {number}
 */
function firstTopLevelComma(tokens, blocks, start, end) {
  for (let i = start; i < end; i = nextComponent(blocks, i, end)) {
    if (tokens[i][0] === CssType.Comma) return i;
  }
  return -1;
}

export { closerAt, closeIn, firstTopLevelComma, matchBlocks, nextComponent };
