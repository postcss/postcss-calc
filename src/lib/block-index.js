import { TokenType as CssType } from '@csstools/css-tokenizer';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

/**
 * Read-only delimiter navigation for one native token stream range.
 *
 * @typedef {Readonly<{
 *   closeOf: (openIndex: number, end?: number) => number,
 *   nextComponent: (index: number, end: number) => number,
 *   firstTopLevelComma: (start: number, end: number) => number,
 *   maxDepth: number,
 * }>} BlockIndex
 */

const BLOCK_CLOSE = new Map([
  [CssType.Function, CssType.CloseParen],
  [CssType.OpenParen, CssType.CloseParen],
  [CssType.OpenSquare, CssType.CloseSquare],
  [CssType.OpenCurly, CssType.CloseCurly],
]);

/**
 * Build the delimiter index once for a token stream range. Matching remains
 * LIFO: a mismatched closer is ignored and does not disturb the open stack.
 *
 * @param {CSSToken[]} tokens
 * @param {number} [start]
 * @param {number} [end]
 * @return {BlockIndex}
 */
function indexBlocks(tokens, start = 0, end = tokens.length) {
  const rangeStart = Math.max(0, start);
  const rangeEnd = Math.min(tokens.length, Math.max(rangeStart, end));
  /** @type {Map<number, number>} */
  const closes = new Map();
  /** @type {{index: number, close: import('@csstools/css-tokenizer').TokenType}[]} */
  const stack = [];
  let maxDepth = 0;

  for (let i = rangeStart; i < rangeEnd; i++) {
    const type = tokens[i][0];
    const close = BLOCK_CLOSE.get(type);
    if (close !== undefined) {
      stack.push({ index: i, close });
      maxDepth = Math.max(maxDepth, stack.length);
      continue;
    }

    if (
      type === CssType.CloseParen ||
      type === CssType.CloseSquare ||
      type === CssType.CloseCurly
    ) {
      const open = stack.at(-1);
      if (open === undefined || open.close !== type) {
        continue;
      }
      stack.pop();
      closes.set(open.index, i);
    }
  }

  /** @param {number | undefined} bound @return {number} */
  const boundedEnd = (bound) =>
    Math.min(rangeEnd, Math.max(rangeStart, bound ?? rangeEnd));

  /** @type {BlockIndex} */
  const blockIndex = {
    closeOf(openPosition, endPosition) {
      const close = closes.get(openPosition) ?? -1;
      const bound = boundedEnd(endPosition);
      return close >= rangeStart && close < bound ? close : -1;
    },
    nextComponent(position, endPosition) {
      const bound = boundedEnd(endPosition);
      if (position < rangeStart || position >= bound) return bound;
      const close = blockIndex.closeOf(position, bound);
      return close === -1 ? position + 1 : close + 1;
    },
    firstTopLevelComma(startPosition, endPosition) {
      const bound = boundedEnd(endPosition);
      for (let i = Math.max(rangeStart, startPosition); i < bound;) {
        if (tokens[i][0] === CssType.Comma) return i;
        i = blockIndex.nextComponent(i, bound);
      }
      return -1;
    },
    maxDepth,
  };

  return blockIndex;
}

export { indexBlocks };
