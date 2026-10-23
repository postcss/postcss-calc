// Opaque function parsing: `var()`, unknown functions and their component trees.
import { TokenType as CssType } from '@csstools/css-tokenizer';
import { ident, opaqueCall } from '../node.js';
import { lookupMathFunction } from '../functions.js';
import { closeIn, firstTopLevelComma } from '../blocks.js';
import { joinTokens } from '../offsets.js';
import { ParseError, isTrivia } from './state.js';
import { sourceSpelling } from './tokens.js';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('../node.js').Node} Node */
/** @typedef {import('../node.js').OpaqueComponent} OpaqueComponent */
/** @typedef {import('./state.js').ParseState} ParseState */
/** @typedef {import('../parser.js').ParseRange} ParseRange */

/** @param {OpaqueComponent[]} target @param {OpaqueComponent} part */
function pushComponent(target, part) {
  if (typeof part === 'string' && typeof target.at(-1) === 'string')
    target[target.length - 1] += part;
  else target.push(part);
}

/**
 * The closer of the call whose function token is `index`. The state has
 * already moved past that token, so the position names the token after it.
 *
 * @param {ParseState} state
 * @param {number} index
 * @param {string} name
 * @return {number}
 */
function closeOfCall(state, index, name) {
  const close = closeIn(state.close, index, state.end);
  if (close === -1) throw new ParseError(`Unclosed ${name}(`, state.pos);
  return close;
}

/**
 * @param {ParseState} state
 * @param {number} index
 * @param {string} name
 * @param {string} rawName
 * @param {ParseRange} parseRange
 * @return {Node}
 */
function parseOpaqueCall(state, index, name, rawName, parseRange) {
  const close = closeOfCall(state, index, name);
  state.pos = close + 1;
  return opaqueCall(
    name,
    componentTree(state, index + 1, close, parseRange, []),
    sourceSpelling(rawName, name)
  );
}

/**
 * The custom-property ident that is the only token before any comma.
 *
 * @param {CSSToken[]} tokens
 * @param {number} start
 * @param {number} end
 */
function customProperty(tokens, start, end) {
  /** @type {CSSToken | null} */
  let found = null;
  let foundIndex = -1;
  for (let i = start; i < end; i++) {
    if (isTrivia(tokens[i][0])) continue;
    if (found !== null) return null;
    found = tokens[i];
    foundIndex = i;
  }
  if (!found || found[0] !== CssType.Ident) return null;
  const decoded = found[4].value;
  return decoded.startsWith('--') && decoded !== '--'
    ? { decoded, raw: found[1], index: foundIndex }
    : null;
}

/**
 * Append the components of `[start, rangeEnd)` to `root` and return it. Raw
 * token text is merged into the preceding string. A supported math function
 * becomes a parsed node, or raw text when it does not parse, and the scan
 * resumes after its closer. Other blocks are plain text, so their contents
 * are scanned as ordinary tokens.
 *
 * @param {ParseState} state
 * @param {number} start
 * @param {number} rangeEnd
 * @param {ParseRange} parseRange
 * @param {OpaqueComponent[]} root Callers seed `root` so leading components need no copy.
 * @return {OpaqueComponent[]}
 */
function componentTree(state, start, rangeEnd, parseRange, root) {
  const { tokens, close: closers } = state;
  let i = start;
  while (i < rangeEnd) {
    const token = tokens[i];
    const close = closeIn(closers, i, rangeEnd);
    if (
      close !== -1 &&
      token[0] === CssType.Function &&
      lookupMathFunction(token[4].value) !== undefined
    ) {
      try {
        pushComponent(root, parseRange(tokens, closers, i, close + 1));
      } catch {
        pushComponent(root, joinTokens(tokens, i, close + 1));
      }
      i = close + 1;
      continue;
    }
    pushComponent(root, token[1]);
    i++;
  }
  return root;
}

/**
 * @param {ParseState} state
 * @param {number} index
 * @param {string} name
 * @param {string} rawName
 * @param {ParseRange} parseRange
 * @return {Node}
 */
function parseVar(state, index, name, rawName, parseRange) {
  const { tokens } = state;
  const start = index + 1;
  const close = closeOfCall(state, index, name);
  const comma = firstTopLevelComma(tokens, state.close, start, close);
  const property = customProperty(tokens, start, comma === -1 ? close : comma);
  if (!property)
    throw new ParseError(`Invalid custom property in ${name}()`, start);
  state.pos = close + 1;
  /** @type {OpaqueComponent[]} */
  const components = [
    ident(property.decoded, sourceSpelling(property.raw, property.decoded)),
  ];
  if (comma !== -1)
    componentTree(state, property.index + 1, close, parseRange, components);
  return opaqueCall(name, components, sourceSpelling(rawName, name));
}

export { parseOpaqueCall, parseVar };
