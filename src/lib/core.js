// The reducer core: scan a token list for supported math functions, compile
// each one, and report every changed range. The string and token wrappers
// own tokenizing and splicing; this module owns nothing else.
import { parseRange } from './parser.js';
import { ParseError, positionedError } from './parser/state.js';
import { simplify } from './simplify.js';
import { analyze } from './analyze.js';
import { printResult } from './serialize.js';
import { firstCharOf, lastCharBefore } from './serialize/fuse.js';
import { closerAt, matchBlocks } from './blocks.js';
import { assertDepth } from './limits.js';
import { hasMathFunctionToken, mathFunctionAt } from './functions.js';
import { joinTokens, offsetLookup } from './offsets.js';

/** @typedef {import('../reduce.js').ResolvedReduceCalcOptions} ResolvedReduceCalcOptions */
/** @typedef {import('../reduce.js').ReduceDiagnostics} ReduceDiagnostics */
/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('./blocks.js').Blocks} Blocks */
/** @typedef {import('./functions.js').MathFunction} MathFunction */
/** @typedef {import('./serialize/sink.js').Sink} Sink */

/**
 * Where `reduceTokenList` gets its sinks and sends its results. The printer
 * writes into the sink that `createSink` makes for the candidate
 * `[start, end)`, and `emit` receives each changed range with its sink.
 *
 * @template {Sink} S
 * @typedef {object} ReplacementTarget
 * @property {(start: number, end: number) => S} createSink
 * @property {(start: number, end: number, printed: S) => void} emit
 */

/**
 * @param {unknown} error
 * @return {Error}
 */
function asError(error) {
  return error instanceof Error ? error : new Error('Error', { cause: error });
}

/**
 * Parse, analyze and simplify one supported math function. A throw means the
 * range is not a valid calculation.
 *
 * @param {CSSToken[]} tokens
 * @param {Blocks} blocks
 * @param {number} start Index of the function token.
 * @param {number} end Index after its closer, or the end of the range when unclosed.
 * @param {{normalizedName: string, definition: MathFunction}} lookup
 * @param {ResolvedReduceCalcOptions} options
 */
function compileCandidate(tokens, blocks, start, end, lookup, options) {
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
  return {
    result: {
      tree,
      status,
      rootName: lookup.normalizedName,
      rootSpelling: tokens[start][1].slice(0, -1),
      calculation: isCalc,
    },
    printOptions: {
      precision: options.precision,
      unwrapSingleNegativeNumber: options.unwrapSingleNegativeNumber,
      unwrapSingleValue: options.unwrapSingleValue,
    },
    unresolved,
  };
}

/**
 * Print a compiled candidate into `sink`. A throw from the printer is reported
 * and yields no replacement.
 *
 * @template {Sink} S
 * @param {ReturnType<typeof compileCandidate>} compiled
 * @param {S} sink
 * @param {ReduceDiagnostics} diagnostics
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 * @return {S | undefined}
 */
function printCandidate(compiled, sink, diagnostics, tokens, start, end) {
  try {
    return printResult(compiled.result, compiled.printOptions, sink)
      ? sink
      : undefined;
  } catch (error) {
    diagnostics.onParseError?.(asError(error), joinTokens(tokens, start, end));
    return undefined;
  }
}

/**
 * The printed replacement for `tokens[from, to)`, with a space on each side
 * where it would otherwise merge into the token beside it, as in
 * `calc(1px + 1px)b` becoming `2pxb`.
 *
 * The neighbours are the tokens just outside the range, skipping EOF tokens,
 * because the replacement is spliced in between them.
 *
 * @template {Sink} S
 * @param {S} printed
 * @param {CSSToken[]} tokens
 * @param {number} from
 * @param {number} to
 * @return {S}
 */
function fitted(printed, tokens, from, to) {
  printed.fit(
    lastCharBefore(tokens, from),
    firstCharOf(tokens, to, tokens.length)
  );
  return printed;
}

/**
 * Reduce every supported math function in `tokens[start, end)`. Each function
 * is one candidate, so a nested function is never reduced on its own, and an
 * invalid outer function is reported without partial output. Blocks and
 * error offsets read the range as the list it names would: a block open at
 * `end` is unclosed, and error offsets count from `start`. The one exception
 * is the token on each side of a replacement, which may lie outside the range:
 * a replacement gets a space when it would fuse with it.
 *
 * Reads each token's type, raw text and parsed value (`token[4]`), never its
 * source offsets (`token[2]`, `token[3]`), so the list may have been edited
 * since it was tokenized. Emitted indices are indices into `tokens`.
 *
 * @template {Sink} S
 * @param {CSSToken[]} tokens
 * @param {ResolvedReduceCalcOptions} options Shared by every call; never changed.
 * @param {ReduceDiagnostics} diagnostics Warnings and parse errors for this call.
 * @param {ReplacementTarget<S>} target
 * @param {number} start
 * @param {number} end
 * @param {string} [source] The joined text of the range, when the caller already has it.
 * @return {void}
 */
function reduceTokenList(
  tokens,
  options,
  diagnostics,
  target,
  start,
  end,
  source
) {
  if (!hasMathFunctionToken(tokens, start, end)) return;

  /** @type {Blocks} */
  let blocks;
  try {
    const matched = matchBlocks(tokens, start, end);
    assertDepth(matched.maxDepth);
    blocks = matched.blocks;
  } catch (error) {
    diagnostics.onParseError?.(
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
    let compiled;
    try {
      compiled = compileCandidate(
        tokens,
        blocks,
        i,
        candidateEnd,
        lookup,
        options
      );
    } catch (error) {
      diagnostics.onParseError?.(
        positionedError(asError(error), offsetOf),
        joinTokens(tokens, i, candidateEnd)
      );
    }
    if (compiled !== undefined) {
      const printed = printCandidate(
        compiled,
        target.createSink(i, candidateEnd),
        diagnostics,
        tokens,
        i,
        candidateEnd
      );
      if (options.warnWhenCannotResolve && compiled.unresolved) {
        wholeText ??= joinTokens(tokens, start, end);
        diagnostics.onWarn?.('Could not reduce expression: ' + wholeText);
      }
      if (printed !== undefined) {
        target.emit(i, candidateEnd, fitted(printed, tokens, i, candidateEnd));
      }
    }
    // A supported function is one candidate, so its nested calls are skipped.
    // An unclosed one runs to the end of the list.
    if (closer === -1) break;
    i = closer;
  }
}

export { reduceTokenList };
