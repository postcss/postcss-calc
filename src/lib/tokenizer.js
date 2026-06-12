'use strict';

// Folds @csstools/css-tokenizer output into the calc() token subset.

// @csstools/css-tokenizer is ESM-only and this package is CJS. require(esm)
// must happen at first use, not at module evaluation — a consumer's ESM
// graph may also link the tokenizer (other csstools plugins do), and a
// load-time require would hit ERR_REQUIRE_CYCLE_MODULE there.
/** @type {typeof import('@csstools/css-tokenizer') | undefined} */
let cssTokenizer;

/**
 * @typedef {'number' | 'dimension' | 'ident' | 'punct' | 'eof'} TokenType
 * @typedef {object} Token
 * @property {TokenType} type
 * @property {string} value
 * @property {string} [unit] Present on `dimension` tokens; `%` for percentages.
 * @property {number} pos
 * @property {boolean} ws Whitespace immediately before — drives the §10.1 `+`/`-` rule.
 */

const PUNCT_DELIMS = new Set(['+', '-', '*', '/']);

const NUMERIC_RAW = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/;

/**
 * @param {string} input
 * @return {Token[]}
 */
function tokenize(input) {
  cssTokenizer ??= require('@csstools/css-tokenizer');
  const { tokenize: tokenizeCss, TokenType: CssType } = cssTokenizer;
  /** @type {Token[]} */
  const tokens = [];
  let ws = true;

  // CSS absorbs leading signs (`-5px` is one token); the parser expects
  // punct sign + unsigned numeric, so split them back out.
  /**
   * @param {string} raw
   * @param {string | undefined} unit
   * @param {number} pos
   * @return {void}
   */
  function pushNumeric(raw, unit, pos) {
    let value = /** @type {RegExpExecArray} */ (NUMERIC_RAW.exec(raw))[0];
    const sign = value[0];
    if (sign === '+' || sign === '-') {
      tokens.push({ type: 'punct', value: sign, pos, ws });
      value = value.slice(1);
      pos += 1;
      ws = false;
    }
    if (unit === undefined) {
      tokens.push({ type: 'number', value, pos, ws });
    } else {
      tokens.push({ type: 'dimension', value, unit, pos, ws });
    }
    ws = false;
  }

  for (const t of tokenizeCss({ css: input })) {
    switch (t[0]) {
      case CssType.Whitespace:
      case CssType.Comment:
        ws = true;
        continue;
      case CssType.Number:
        pushNumeric(t[1], undefined, t[2]);
        continue;
      case CssType.Dimension:
        pushNumeric(t[1], t[4].unit, t[2]);
        continue;
      case CssType.Percentage:
        pushNumeric(t[1], '%', t[2]);
        continue;
      case CssType.Ident:
        tokens.push({ type: 'ident', value: t[4].value, pos: t[2], ws });
        break;
      case CssType.Function:
        tokens.push({ type: 'ident', value: t[4].value, pos: t[2], ws });
        tokens.push({ type: 'punct', value: '(', pos: t[2] + t[1].length - 1, ws: false });
        break;
      case CssType.OpenParen:
        tokens.push({ type: 'punct', value: '(', pos: t[2], ws });
        break;
      case CssType.CloseParen:
        tokens.push({ type: 'punct', value: ')', pos: t[2], ws });
        break;
      case CssType.Comma:
        tokens.push({ type: 'punct', value: ',', pos: t[2], ws });
        break;
      case CssType.Delim:
        if (!PUNCT_DELIMS.has(t[4].value)) {
          throw new Error(
            `Unexpected character "${t[4].value}" at position ${t[2]}`
          );
        }
        tokens.push({ type: 'punct', value: t[4].value, pos: t[2], ws });
        break;
      case CssType.EOF:
        tokens.push({ type: 'eof', value: '', pos: input.length, ws });
        break;
      default:
        throw new Error(
          `Unexpected character "${t[1][0] ?? ''}" at position ${t[2]}`
        );
    }
    ws = false;
  }

  return tokens;
}

module.exports = { tokenize };
