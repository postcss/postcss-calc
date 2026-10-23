// The reducer core: scan a token list for supported math functions, compile
// each one, and report every changed range. The string reducer owns
// tokenizing and splicing; this module owns nothing else.
import { parseRange } from './parser.js';
import { ParseError, positionedError } from './parser/state.js';
import { simplify } from './simplify.js';
import { analyze } from './analyze.js';
import { serializeResult } from './serialize.js';
import { matchBlocks } from './blocks.js';
import { assertDepth } from './limits.js';
import { hasMathFunctionToken, mathFunctionAt } from './functions.js';
import { joinTokens, offsetLookup } from './offsets.js';

/** @typedef {import('../reduce.js').ResolvedReduceCalcOptions} ResolvedReduceCalcOptions */
/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('./functions.js').MathFunction} MathFunction */

/**
 * Receives one replaced range. `start` and `end` are token indices, `end`
 * exclusive.
 *
 * @callback EmitReplacement
 * @param {number} start
 * @param {number} end
 * @param {string} text
 * @return {void}
 */

/**
 * @param {unknown} error
 * @return {Error}
 */
function asError(error) {
  return error instanceof Error ? error : new Error('Error', { cause: error });
}

/**
 * Parse, analyze and simplify one supported math function, then serialize it.
 * A throw from parsing or analysis means the range is not a valid calculation.
 * A throw from serialization is reported and yields no replacement text.
 *
 * @param {CSSToken[]} tokens
 * @param {Int32Array} close
 * @param {number} start Index of the function token.
 * @param {number} end Index after its closer, or `tokens.length` when unclosed.
 * @param {{normalizedName: string, definition: MathFunction}} lookup
 * @param {ResolvedReduceCalcOptions} options
 * @return {{text: string | undefined, unresolved: boolean}}
 */
function compileCandidate(tokens, close, start, end, lookup, options) {
  const name = /** @type {{value: string}} */ (tokens[start][4]).value;
  const isCalc = lookup.definition.calculation === true;
  if (close[start] === -1) throw new ParseError(`Unclosed ${name}(`, start);
  // Unpositioned parse errors: the caller positions them with a shared lookup.
  const parsed = isCalc
    ? parseRange(tokens, close, start + 1, close[start])
    : parseRange(tokens, close, start, end);
  const analysis = analyze(parsed);
  if (!analysis.valid) {
    throw new Error('Invalid CSS calculation type');
  }
  const tree = simplify(parsed, options.precision);
  const unresolved = analysis.unresolved;
  const original =
    unresolved && !isCalc ? joinTokens(tokens, start, end) : undefined;
  /** @type {'resolved' | 'unresolved'} */
  const status = unresolved ? 'unresolved' : 'resolved';
  const result = {
    tree,
    status,
    rootName: lookup.normalizedName,
    rootSpelling: tokens[start][1].slice(0, -1),
    calculation: isCalc,
    original,
  };
  try {
    return {
      text: serializeResult(result, {
        precision: options.precision,
        unwrapSingleNegativeNumber: options.unwrapSingleNegativeNumber,
        unwrapSingleValue: options.unwrapSingleValue,
      }),
      unresolved,
    };
  } catch (error) {
    options.onParseError?.(asError(error), joinTokens(tokens, start, end));
    return { text: undefined, unresolved };
  }
}

/**
 * Reduce every supported math function in a token list. Each function is one
 * candidate, so a nested function is never reduced on its own, and an invalid
 * outer function is reported without partial output.
 *

 * @param {CSSToken[]} tokens
 * @param {ResolvedReduceCalcOptions} options
 * @param {EmitReplacement} emit
 * @param {string} source The joined token text.
 * @return {void}
 */
function reduceTokenList(tokens, options, emit, source) {
  if (!hasMathFunctionToken(tokens)) return;

  /** @type {ReturnType<typeof matchBlocks>} */
  let blocks;
  try {
    blocks = matchBlocks(tokens);
    assertDepth(blocks.maxDepth);
  } catch (error) {
    options.onParseError?.(asError(error), source);
    return;
  }
  const { close } = blocks;

  const offsetOf = offsetLookup(tokens);
  for (let i = 0; i < tokens.length; i++) {
    const lookup = mathFunctionAt(tokens, i);
    if (lookup === undefined) continue;
    const end = close[i] === -1 ? tokens.length : close[i] + 1;

    /** @type {ReturnType<typeof compileCandidate> | undefined} */
    let result;
    try {
      result = compileCandidate(tokens, close, i, end, lookup, options);
    } catch (error) {
      options.onParseError?.(
        positionedError(asError(error), offsetOf),
        joinTokens(tokens, i, end)
      );
    }
    if (result !== undefined) {
      if (options.warnWhenCannotResolve && result.unresolved) {
        options.onWarn?.('Could not reduce expression: ' + source);
      }
      if (result.text !== undefined) emit(i, end, result.text);
    }
    // A supported function is one candidate, so its nested calls are skipped.
    // An unclosed one runs to the end of the list.
    if (close[i] === -1) break;
    i = close[i];
  }
}

export { reduceTokenList };
