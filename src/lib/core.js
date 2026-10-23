// The reducer core: scan a token list for supported math functions, compile
// each one, and report every changed range. The string and token wrappers
// own tokenizing and splicing; this module owns nothing else.
import { parseRange } from './parser.js';
import { ParseError, positionedError } from './parser/state.js';
import { simplify } from './simplify.js';
import { analyze } from './analyze.js';
import { printResult, serializeResult } from './serialize.js';
import { TokenSink } from './serialize/sink.js';
import { wouldFuse } from './serialize/text-sink.js';
import { closerAt, matchBlocks } from './blocks.js';
import { assertDepth } from './limits.js';
import { hasMathFunctionToken, mathFunctionAt } from './functions.js';
import { joinTokens, offsetLookup } from './offsets.js';

/** @typedef {import('../reduce.js').ResolvedReduceCalcOptions} ResolvedReduceCalcOptions */
/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('./blocks.js').Blocks} Blocks */
/** @typedef {import('./functions.js').MathFunction} MathFunction */

/**
 * Receives one replaced range. `start` and `end` are token indices, `end`
 * exclusive. `printed` is the replacement text, or the token sink holding the
 * replacement tokens when the caller asked for tokens.
 *
 * @callback EmitReplacement
 * @param {number} start
 * @param {number} end
 * @param {string | TokenSink} printed
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
 * @param {Blocks} blocks
 * @param {number} start Index of the function token.
 * @param {number} end Index after its closer, or the end of the range when unclosed.
 * @param {{normalizedName: string, definition: MathFunction}} lookup
 * @param {ResolvedReduceCalcOptions} options
 * @param {boolean} printTokens Print into a token sink instead of a string.
 * @return {{text: string | TokenSink | undefined, unresolved: boolean}}
 */
function compileCandidate(
  tokens,
  blocks,
  start,
  end,
  lookup,
  options,
  printTokens
) {
  const name = /** @type {{value: string}} */ (tokens[start][4]).value;
  const isCalc = lookup.definition.calculation === true;
  const closer = closerAt(blocks, start);
  if (closer === -1) throw new ParseError(`Unclosed ${name}(`, start);
  // Unpositioned parse errors: the caller positions them with a shared lookup.
  const parsed = isCalc
    ? parseRange(tokens, blocks, start + 1, closer)
    : parseRange(tokens, blocks, start, end);
  const analysis = analyze(parsed);
  if (!analysis.valid) {
    throw new Error('Invalid CSS calculation type');
  }
  const tree = simplify(parsed, options.precision);
  const unresolved = analysis.unresolved;
  /** @type {'resolved' | 'unresolved'} */
  const status = unresolved ? 'unresolved' : 'resolved';
  const result = {
    tree,
    status,
    rootName: lookup.normalizedName,
    rootSpelling: tokens[start][1].slice(0, -1),
    calculation: isCalc,
  };
  const printOptions = {
    precision: options.precision,
    unwrapSingleNegativeNumber: options.unwrapSingleNegativeNumber,
    unwrapSingleValue: options.unwrapSingleValue,
  };
  try {
    if (printTokens) {
      const sink = new TokenSink(tokens, start, end);
      const printed = printResult(result, printOptions, sink);
      return { text: printed ? sink : undefined, unresolved };
    }
    return { text: serializeResult(result, printOptions), unresolved };
  } catch (error) {
    options.onParseError?.(asError(error), joinTokens(tokens, start, end));
    return { text: undefined, unresolved };
  }
}

/**
 * The printed replacement for `tokens[from, to)`, with a space on each side
 * where it would otherwise merge into the token beside it, as in
 * `calc(1px + 1px)b` becoming `2pxb`.
 *
 * @template {string | TokenSink} T
 * @param {T} printed
 * @param {CSSToken[]} tokens
 * @param {number} from
 * @param {number} to
 * @return {T | string}
 */
function fitted(printed, tokens, from, to) {
  const before = tokens[from - 1]?.[1].at(-1);
  const after = tokens[to]?.[1][0];
  if (typeof printed !== 'string') {
    printed.fit(before, after);
    return printed;
  }
  return (
    (wouldFuse(before, printed[0]) ? ' ' : '') +
    printed +
    (wouldFuse(printed.at(-1), after) ? ' ' : '')
  );
}

/**
 * Reduce every supported math function in `tokens[start, end)`. Each function
 * is one candidate, so a nested function is never reduced on its own, and an
 * invalid outer function is reported without partial output. The range reads
 * as the list it names would: a block open at `end` is unclosed, and error
 * offsets count from `start`.
 *
 * Reads each token's type, raw text and parsed value (`token[4]`), never its
 * source offsets (`token[2]`, `token[3]`), so the list may have been edited
 * since it was tokenized. Emitted indices are indices into `tokens`.
 *
 * @param {CSSToken[]} tokens
 * @param {ResolvedReduceCalcOptions} options
 * @param {EmitReplacement} emit
 * @param {number} start
 * @param {number} end
 * @param {string} [source] The joined text of the range, when the caller already has it.
 * @param {boolean} [printTokens] Emit token sinks instead of text.
 * @return {void}
 */
function reduceTokenList(
  tokens,
  options,
  emit,
  start,
  end,
  source,
  printTokens = false
) {
  if (!hasMathFunctionToken(tokens, start, end)) return;

  /** @type {Blocks} */
  let blocks;
  try {
    const matched = matchBlocks(tokens, start, end);
    assertDepth(matched.maxDepth);
    blocks = matched.blocks;
  } catch (error) {
    options.onParseError?.(
      asError(error),
      source ?? joinTokens(tokens, start, end)
    );
    return;
  }
  const offsetOf = offsetLookup(tokens, start, end);
  let wholeText = source;
  for (let i = start; i < end; i++) {
    const lookup = mathFunctionAt(tokens, i);
    if (lookup === undefined) continue;
    const closer = closerAt(blocks, i);
    const candidateEnd = closer === -1 ? end : closer + 1;

    /** @type {ReturnType<typeof compileCandidate> | undefined} */
    let result;
    try {
      result = compileCandidate(
        tokens,
        blocks,
        i,
        candidateEnd,
        lookup,
        options,
        printTokens
      );
    } catch (error) {
      options.onParseError?.(
        positionedError(asError(error), offsetOf),
        joinTokens(tokens, i, candidateEnd)
      );
    }
    if (result !== undefined) {
      if (options.warnWhenCannotResolve && result.unresolved) {
        wholeText ??= joinTokens(tokens, start, end);
        options.onWarn?.('Could not reduce expression: ' + wholeText);
      }
      if (result.text !== undefined) {
        emit(i, candidateEnd, fitted(result.text, tokens, i, candidateEnd));
      }
    }
    // A supported function is one candidate, so its nested calls are skipped.
    // An unclosed one runs to the end of the list.
    if (closer === -1) break;
    i = closer;
  }
}

export { reduceTokenList };
