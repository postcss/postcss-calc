import { ROUND_STRATEGIES } from './simplify/round.js';
import {
  addTypes,
  failureType,
  isFailure,
  matchingArguments,
  numberType,
  unknownType,
} from './types.js';

/**
 * @typedef {import('./node.js').Node} Node
 * @typedef {import('./types.js').CalculationType} CalculationType
 */

/** @param {CalculationType[]} args @return {CalculationType} */
function analyzeTrig(args) {
  return args.length === 1 &&
    (args[0].kind === 'unknown' ||
      args[0].kind === 'number' ||
      (args[0].kind === 'dimension' && args[0].base === 'angle'))
    ? numberType
    : failureType;
}

/** @param {CalculationType[]} args @return {CalculationType} */
function analyzeInverseTrig(args) {
  if (args.length !== 1 || args[0].kind === 'dimension') {
    return failureType;
  }
  return args[0].kind === 'unknown'
    ? unknownType
    : { kind: 'dimension', base: 'angle' };
}

/** @param {CalculationType[]} args @return {CalculationType} */
function analyzeIdentity(args) {
  return args.length === 1 ? args[0] : failureType;
}

/** @param {CalculationType[]} args @return {CalculationType} */
function analyzeSign(args) {
  return args.length === 1 ? numberType : failureType;
}

/** @param {CalculationType[]} args @param {Node[]} nodes @return {CalculationType} */
function analyzeRound(args, nodes) {
  const strategy = nodes[0];
  const hasStrategy =
    strategy?.type === 'Ident' &&
    ROUND_STRATEGIES.has(strategy.name.toLowerCase());
  const start = hasStrategy ? 1 : 0;
  const valueCount = args.length - start;
  if (valueCount === 1) {
    const value = args[start];
    if (value.kind === 'dimension') return failureType;
    if (value.kind === 'unknown') return unknownType;
    return numberType;
  }
  if (valueCount !== 2) return failureType;
  const type = addTypes(args[start], args[start + 1]);
  return isFailure(type) ? failureType : type;
}

/** @param {CalculationType[]} args @return {CalculationType} */
function analyzeAtan2(args) {
  const type = matchingArguments(args, 2, 2);
  if (isFailure(type)) return type;
  // The type table gives atan2() «["angle" → 1]»; an unresolved result is
  // plain unknown, never the percentage of its arguments.
  if (type.kind === 'unknown') return unknownType;
  return { kind: 'dimension', base: 'angle' };
}

/** @param {CalculationType[]} args @return {CalculationType} */
function analyzeCalc(args) {
  return args.length === 1 ? args[0] : failureType;
}

/** @param {Node} node @return {boolean} */
function isRoundStrategy(node) {
  return node.type === 'Ident' && ROUND_STRATEGIES.has(node.name.toLowerCase());
}

/** @param {Node} node @param {number} index @return {boolean} */
function isClampKeyword(node, index) {
  return (
    (index === 0 || index === 2) &&
    node.type === 'Ident' &&
    node.name.toLowerCase() === 'none'
  );
}

/** @param {CalculationType[]} args @param {Node[]} nodes @return {CalculationType} */
function analyzeClamp(args, nodes) {
  if (args.length !== 3) return failureType;
  let valueCount = 0;
  /** @type {CalculationType} */ let result = failureType;
  for (let index = 0; index < args.length; index++) {
    if (isClampKeyword(nodes[index], index)) continue;
    result = valueCount === 0 ? args[index] : addTypes(result, args[index]);
    valueCount++;
  }
  if (valueCount < 1 || isFailure(result)) return failureType;
  return result;
}

export {
  analyzeAtan2,
  analyzeCalc,
  analyzeClamp,
  analyzeIdentity,
  analyzeInverseTrig,
  analyzeRound,
  analyzeSign,
  analyzeTrig,
  isClampKeyword,
  isRoundStrategy,
};
