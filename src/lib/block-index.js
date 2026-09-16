import { TokenType as CssType } from '@csstools/css-tokenizer';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

const BLOCK_CLOSE = new Map([
  [CssType.Function, CssType.CloseParen],
  [CssType.OpenParen, CssType.CloseParen],
  [CssType.OpenSquare, CssType.CloseSquare],
  [CssType.OpenCurly, CssType.CloseCurly],
]);

/**
 * Read-only delimiter navigation for one native token stream range.
 */
class BlockIndex {
  /** @type {CSSToken[]} */
  #tokens;
  /** @type {number} */
  #rangeStart;
  /** @type {number} */
  #rangeEnd;
  /** @type {Map<number, number>} */
  #closes = new Map();
  /** @type {number} */
  #maxDepth = 0;

  /**
   * Build the delimiter index once for a token stream range. Matching remains
   * LIFO: a mismatched closer is ignored and does not disturb the open stack.
   *
   * @param {CSSToken[]} tokens
   * @param {number} start
   * @param {number} end
   */
  constructor(tokens, start, end) {
    this.#tokens = tokens;
    this.#rangeStart = Math.max(0, start);
    this.#rangeEnd = Math.min(tokens.length, Math.max(this.#rangeStart, end));
    /** @type {{index: number, close: import('@csstools/css-tokenizer').TokenType}[]} */
    const stack = [];

    for (let i = this.#rangeStart; i < this.#rangeEnd; i++) {
      const type = tokens[i][0];
      const close = BLOCK_CLOSE.get(type);
      if (close !== undefined) {
        stack.push({ index: i, close });
        this.#maxDepth = Math.max(this.#maxDepth, stack.length);
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
        this.#closes.set(open.index, i);
      }
    }
  }

  /** @return {number} */
  get maxDepth() {
    return this.#maxDepth;
  }

  /** @param {number | undefined} end @return {number} */
  #boundedEnd(end) {
    return Math.min(
      this.#rangeEnd,
      Math.max(this.#rangeStart, end ?? this.#rangeEnd)
    );
  }

  /** @param {number} openPosition @param {number} [endPosition] @return {number} */
  closeOf(openPosition, endPosition) {
    const close = this.#closes.get(openPosition) ?? -1;
    const bound = this.#boundedEnd(endPosition);
    return close >= this.#rangeStart && close < bound ? close : -1;
  }

  /** @param {number} position @param {number} endPosition @return {number} */
  nextComponent(position, endPosition) {
    const bound = this.#boundedEnd(endPosition);
    if (position < this.#rangeStart || position >= bound) return bound;
    const close = this.closeOf(position, bound);
    return close === -1 ? position + 1 : close + 1;
  }

  /** @param {number} startPosition @param {number} endPosition @return {number} */
  firstTopLevelComma(startPosition, endPosition) {
    const bound = this.#boundedEnd(endPosition);
    for (let i = Math.max(this.#rangeStart, startPosition); i < bound;) {
      if (this.#tokens[i][0] === CssType.Comma) return i;
      i = this.nextComponent(i, bound);
    }
    return -1;
  }
}

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
  return new BlockIndex(tokens, start, end);
}

export { indexBlocks };
