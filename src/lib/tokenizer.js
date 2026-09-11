// Thin project-local entry point for the CSS Syntax tokenizer. The parser
// consumes native tokens directly so decoded values and source spelling remain available.
import { tokenize as tokenizeCss } from '@csstools/css-tokenizer';

/** @param {string} input @return {import('@csstools/css-tokenizer').CSSToken[]} */
function tokenize(input) {
  return tokenizeCss({ css: input });
}

export { tokenize };
