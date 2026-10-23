import { TokenType as CssType } from '@csstools/css-tokenizer';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */

const BLOCK_CLOSE = new Map([
  [CssType.Function, CssType.CloseParen],
  [CssType.OpenParen, CssType.CloseParen],
  [CssType.OpenSquare, CssType.CloseSquare],
  [CssType.OpenCurly, CssType.CloseCurly],
]);

/**
 * Read-only delimiter navigation for one native token stream.
 */
class BlockIndex {
  /** @type {CSSToken[]} */
  #tokens;
  /** @type {Map<number, number>} */
  #closes = new Map();
  /** @type {number} */
  #maxDepth = 0;

  /**
   * Build the delimiter index once for a token stream. Matching remains
   * LIFO: a mismatched closer is ignored and does not disturb the open stack.
   *
   * @param {CSSToken[]} tokens
   */
  constructor(tokens) {
    this.#tokens = tokens;
    /** @type {{index: number, close: import('@csstools/css-tokenizer').TokenType}[]} */
    const stack = [];

    for (let i = 0; i < tokens.length; i++) {
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
      this.#tokens.length,
      Math.max(0, end ?? this.#tokens.length)
    );
  }

  /** @param {number} openPosition @param {number} [endPosition] @return {number} */
  closeOf(openPosition, endPosition) {
    const close = this.#closes.get(openPosition) ?? -1;
    const bound = this.#boundedEnd(endPosition);
    return close < bound ? close : -1;
  }

  /** @param {number} position @param {number} endPosition @return {number} */
  nextComponent(position, endPosition) {
    const bound = this.#boundedEnd(endPosition);
    if (position < 0 || position >= bound) return bound;
    const close = this.closeOf(position, bound);
    return close === -1 ? position + 1 : close + 1;
  }

  /** @param {number} startPosition @param {number} endPosition @return {number} */
  firstTopLevelComma(startPosition, endPosition) {
    const bound = this.#boundedEnd(endPosition);
    for (let i = Math.max(0, startPosition); i < bound;) {
      if (this.#tokens[i][0] === CssType.Comma) return i;
      i = this.nextComponent(i, bound);
    }
    return -1;
  }
}

/**
 * Build the delimiter index once for a token stream. Matching remains LIFO: a
 * mismatched closer is ignored and does not disturb the open stack.
 *
 * @param {CSSToken[]} tokens
 * @return {BlockIndex}
 */
function indexBlocks(tokens) {
  return new BlockIndex(tokens);
}

export { indexBlocks };
