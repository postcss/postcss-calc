// Opaque function parsing: `var()`, unknown functions and their component trees.
import { TokenType as CssType } from '@csstools/css-tokenizer';
import { ident, opaqueCall } from '../node.js';
import {
  isCalculationFunction,
  isSupportedMathFunction,
} from '../functions.js';
import { assertDepth } from '../limits.js';
import { eofPositionAt, sourceSpelling } from './tokens.js';

/** @typedef {import('@csstools/css-tokenizer').CSSToken} CSSToken */
/** @typedef {import('../node.js').Node} Node */
/** @typedef {import('../node.js').OpaqueComponent} OpaqueComponent */
/** @typedef {import('./tokens.js').ParseInput} ParseInput */
/** @typedef {import('./tokens.js').Cursor} Cursor */
/** @typedef {import('./tokens.js').FunctionToken} FunctionToken */
/** @typedef {(input: ParseInput, start: number, end: number) => Node} ParseRange */

/** @param {OpaqueComponent[]} target @param {OpaqueComponent} part */
function pushComponent(target, part) {
  if (typeof part === 'string' && typeof target.at(-1) === 'string')
    target[target.length - 1] += part;
  else target.push(part);
}

/** @param {ParseInput} input @param {Cursor} cursor @param {FunctionToken} token @param {string} name @return {number} */
function closeOfCall(input, cursor, token, name) {
  const close = input.index.closeOf(token.index, input.end);
  if (close === -1)
    throw new Error(
      `Unclosed ${name}( at position ${eofPositionAt(input, cursor.index)}`
    );
  return close;
}

/** @param {ParseInput} input @param {Cursor} cursor @param {FunctionToken} token @param {string} name @param {string} rawName @param {ParseRange} parseRange @return {Node} */
function parseOpaqueCall(input, cursor, token, name, rawName, parseRange) {
  const close = closeOfCall(input, cursor, token, name);
  cursor.skipTo(close + 1);
  return opaqueCall(
    name,
    componentTree(input, token.index + 1, close, parseRange, []),
    sourceSpelling(rawName, name)
  );
}

/** @param {CSSToken[]} tokens @param {number} start @param {number} end */
function rawTokens(tokens, start, end) {
  let raw = '';
  for (let i = start; i < end; i++) raw += tokens[i][1];
  return raw;
}
/** @param {CSSToken[]} tokens @param {number} start @param {number} end */
function customProperty(tokens, start, end) {
  /** @type {CSSToken | null} */
  let found = null;
  let foundIndex = -1;
  for (let i = start; i < end; i++) {
    const type = tokens[i][0];
    if (type === CssType.Whitespace || type === CssType.Comment) continue;
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
 * Append the component tree of `[start, end)` to `root` and return it.
 * Callers seed `root` so leading components need no copy or spread.
 * @param {ParseInput} input @param {number} start @param {number} end @param {ParseRange} parseRange @param {OpaqueComponent[]} root @return {OpaqueComponent[]}
 */
function componentTree(input, start, end, parseRange, root) {
  /** @type {OpaqueComponent[]} */ let tree = root;
  /** @type {{parent: OpaqueComponent[], tree: OpaqueComponent[], close: number, end: number}[]} */
  const frames = [];
  const { tokens } = input;
  let i = start;
  while (true) {
    if (i >= end) {
      if (frames.length === 0) break;
      const frame =
        /** @type {{parent: OpaqueComponent[], tree: OpaqueComponent[], close: number, end: number}} */ (
          frames.pop()
        );
      tree = frame.parent;
      pushComponent(tree, frame.tree);
      pushComponent(tree, tokens[frame.close][1]);
      end = frame.end;
      i = frame.close + 1;
      continue;
    }

    const token = tokens[i];
    const close = input.index.closeOf(i, end);
    if (close === -1) {
      pushComponent(tree, token[1]);
      i++;
      continue;
    }

    const isMathFunction =
      token[0] === CssType.Function &&
      (isCalculationFunction(token[4].value) ||
        isSupportedMathFunction(token[4].value));
    if (isMathFunction) {
      try {
        pushComponent(tree, parseRange(input, i, close + 1));
      } catch {
        pushComponent(tree, rawTokens(tokens, i, close + 1));
      }
      i = close + 1;
      continue;
    }

    pushComponent(tree, token[1]);
    assertDepth(frames.length + 1);
    /** @type {OpaqueComponent[]} */
    const child = [];
    frames.push({ parent: tree, tree: child, close, end });
    tree = child;
    end = close;
    i++;
  }
  return root;
}
/** @param {ParseInput} input @param {Cursor} cursor @param {FunctionToken} token @param {string} name @param {string} rawName @param {ParseRange} parseRange @return {Node} */
function parseVar(input, cursor, token, name, rawName, parseRange) {
  const { tokens } = input;
  const start = token.index + 1;
  const close = closeOfCall(input, cursor, token, name);
  const comma = input.index.firstTopLevelComma(start, close);
  const property = customProperty(tokens, start, comma === -1 ? close : comma);
  if (!property)
    throw new Error(
      `Invalid custom property in ${name}() at position ${tokens[start]?.[2] ?? eofPositionAt(input, cursor.index)}`
    );
  cursor.skipTo(close + 1);
  /** @type {OpaqueComponent[]} */
  const components = [
    ident(property.decoded, sourceSpelling(property.raw, property.decoded)),
  ];
  if (comma !== -1)
    componentTree(input, property.index + 1, close, parseRange, components);
  return opaqueCall(name, components, sourceSpelling(rawName, name));
}

export { parseOpaqueCall, parseVar };
