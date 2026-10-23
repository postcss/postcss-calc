// Delimiter matching for one token list. `matchBlocks` pairs every opening
// token (`Function`, `(`, `[`, `{`) with its closing token, so navigation is
// index arithmetic on the result.
import { TokenType as CssType } from '@csstools/css-tokenizer';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

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
 * Match every block opener in the list to its closer. Matching is LIFO: a
 * closer that does not match the innermost open block is ignored, so the
 * open stack survives the mismatch. Openers with no closer map to -1.
 *
 * `maxDepth` is the largest number of blocks open at once. The caller decides
 * whether that exceeds the nesting limit.
 *
 * @param {CSSToken[]} tokens
 * @return {{close: Int32Array, maxDepth: number}} `close[i]` is the closer index for opener `i`, or -1.
 */
function matchBlocks(tokens) {
  const close = new Int32Array(tokens.length).fill(-1);
  /** @type {number[]} */
  const openers = [];
  /** @type {CssType[]} */
  const expected = [];
  let maxDepth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const type = tokens[i][0];
    const closer = closerOf(type);
    if (closer !== undefined) {
      openers.push(i);
      expected.push(closer);
      maxDepth = Math.max(maxDepth, openers.length);
      continue;
    }
    if (expected.at(-1) !== type) continue;
    close[/** @type {number} */ (openers.pop())] = i;
    expected.pop();
  }
  return { close, maxDepth };
}

/**
 * The closer of the opener at `index`, or -1 when it has none inside
 * `[index, end)`.
 *
 * @param {Int32Array} close
 * @param {number} index
 * @param {number} end
 * @return {number}
 */
function closeIn(close, index, end) {
  const closer = close[index];
  return closer !== -1 && closer < end ? closer : -1;
}

/**
 * Index after the component (a token, or a whole block) that starts at `index`,
 * never past `end`.
 *
 * @param {Int32Array} close
 * @param {number} index
 * @param {number} end
 * @return {number}
 */
function nextComponent(close, index, end) {
  const closer = closeIn(close, index, end);
  return closer === -1 ? index + 1 : closer + 1;
}

/**
 * First comma outside every block in `[start, end)`, or -1.
 *
 * @param {CSSToken[]} tokens
 * @param {Int32Array} close
 * @param {number} start
 * @param {number} end
 * @return {number}
 */
function firstTopLevelComma(tokens, close, start, end) {
  for (let i = start; i < end; i = nextComponent(close, i, end)) {
    if (tokens[i][0] === CssType.Comma) return i;
  }
  return -1;
}

export { closeIn, firstTopLevelComma, matchBlocks, nextComponent };
