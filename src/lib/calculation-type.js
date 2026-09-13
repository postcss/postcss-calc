// The deliberately small v12 calculation type checker.  It is a guard at
// the reduction boundary, not a second AST or a replacement for CSS's full
// type algebra.

import { baseOf } from './convertUnits.js';
import { getComponents } from './opaque.js';

/** @typedef {import('./node.js').Node} Node */

const MAX_CALCULATION_DEPTH = 1024;
const ROUND_STRATEGIES = new Set(['nearest', 'up', 'down', 'to-zero']);

class CalculationLimitError extends Error {
  /** @param {number} limit */
  constructor(limit) {
    super(`Calculation nesting exceeds the limit of ${limit}`);
    this.name = 'CalculationLimitError';
    this.limit = limit;
  }
}

/** @typedef {{kind: 'number'} | {kind: 'dimension', base: string | null} | {kind: 'unknown'} | {kind: 'failure'}} CalculationType */

/** @type {CalculationType} */ const numberType = { kind: 'number' };
/** @type {CalculationType} */ const unknownType = { kind: 'unknown' };
/** @type {CalculationType} */ const failureType = { kind: 'failure' };

/** @param {CalculationType} type @return {boolean} */
function isFailure(type) {
  return type.kind === 'failure';
}

/** @param {CalculationType} a @param {CalculationType} b @return {CalculationType} */
function addTypes(a, b) {
  if (isFailure(a) || isFailure(b)) return failureType;
  if (a.kind === 'unknown' || b.kind === 'unknown') return unknownType;
  if (a.kind === 'number' && b.kind === 'number') return numberType;
  if (a.kind === 'dimension' && b.kind === 'dimension') {
    if (a.base === null || b.base === null) return unknownType;
    return a.base === b.base ? a : failureType;
  }
  return failureType;
}

/** @param {Node} node @param {number} [depth] @return {CalculationType} */
function calculationType(node, depth = 0) {
  if (depth > MAX_CALCULATION_DEPTH) {
    throw new CalculationLimitError(MAX_CALCULATION_DEPTH);
  }
  switch (node.type) {
    case 'Num':
      return numberType;
    case 'Dim':
      // Percentages are contextual in this milestone. Unknown units are also
      // left opaque, while known families can still reject px + seconds.
      return node.unit === '%'
        ? unknownType
        : { kind: 'dimension', base: baseOf(node.unit) };
    case 'Ident':
      return unknownType;
    case 'Sum': {
      /** @type {CalculationType | null} */
      let result = null;
      for (const term of node.terms) {
        const termType = calculationType(term.node, depth + 1);
        result = result === null ? termType : addTypes(result, termType);
      }
      return result ?? numberType;
    }
    case 'Product': {
      /** @type {CalculationType | null} */
      let numerator = null;
      /** @type {CalculationType | null} */
      let denominator = null;
      const result = numberType;
      for (const factor of node.factors) {
        const factorType = calculationType(factor.node, depth + 1);
        if (isFailure(factorType)) return failureType;
        if (factorType.kind === 'unknown') return unknownType;
        if (factorType.kind !== 'dimension') continue;
        if (factor.exponent === 1) {
          if (numerator !== null) return failureType;
          numerator = factorType;
        } else {
          if (denominator !== null) return failureType;
          denominator = factorType;
        }
      }
      if (numerator !== null && denominator !== null) {
        return numerator.base === denominator.base ? numberType : failureType;
      }
      if (denominator !== null) return failureType;
      return numerator ?? result;
    }
    case 'Call':
      return callType(node, depth);
  }
}

/** @param {Extract<Node, {type: 'Call'}>} node @param {number} depth @return {CalculationType} */
function callType(node, depth) {
  const name = node.name.toLowerCase();
  const args = node.args.map((arg) => calculationType(arg, depth + 1));
  if (args.some(isFailure)) return failureType;
  if (name === 'calc' || name === '-webkit-calc' || name === '-moz-calc') {
    return args.length === 1 ? args[0] : failureType;
  }
  if (getComponents(node)) return unknownType;
  return (
    unaryFunctionType(name, args) ??
    rangeFunctionType(name, args, node.args) ??
    unknownType
  );
}

/** @param {string} name @param {CalculationType[]} args @return {CalculationType | null} */
function unaryFunctionType(name, args) {
  if (name === 'sin' || name === 'cos' || name === 'tan') {
    return args.length === 1 &&
      (args[0].kind === 'unknown' ||
        args[0].kind === 'number' ||
        (args[0].kind === 'dimension' && args[0].base === 'angle'))
      ? numberType
      : failureType;
  }
  if (name === 'asin' || name === 'acos' || name === 'atan') {
    if (args.length !== 1 || args[0].kind === 'dimension') {
      return failureType;
    }
    return args[0].kind === 'unknown'
      ? unknownType
      : { kind: 'dimension', base: 'angle' };
  }
  if (name === 'abs' || name === 'sign')
    return args.length === 1 ? args[0] : failureType;
  if (name === 'sqrt' || name === 'exp') return numberArguments(args, 1, 1);
  if (name === 'log') return numberArguments(args, 1, 2);
  return null;
}

/**
 * Check an all-number function without assuming anything about an unresolved
 * operand. A concrete dimension can never become a number, so it is still a
 * definite error when another argument is opaque.
 * @param {CalculationType[]} args
 * @param {number} min
 * @param {number} max
 * @return {CalculationType}
 */
function numberArguments(args, min, max) {
  if (args.length < min || args.length > max) return failureType;
  if (args.some((arg) => arg.kind === 'dimension')) return failureType;
  return args.some((arg) => arg.kind === 'unknown') ? unknownType : numberType;
}

/**
 * Check values that must share a calculation type. Unknown operands remain
 * unknown: they might resolve to the concrete type required by their peers.
 * @param {CalculationType[]} args
 * @param {number} min
 * @param {number} max
 * @return {CalculationType}
 */
function matchingArguments(args, min, max) {
  if (args.length < min || args.length > max) return failureType;
  let result = args[0];
  for (const arg of args.slice(1)) {
    result = addTypes(result, arg);
    if (isFailure(result)) return failureType;
  }
  return result;
}

/** @param {string} name @param {CalculationType[]} args @param {Node[]} nodes @return {CalculationType | null} */
function rangeFunctionType(name, args, nodes) {
  if (name === 'min' || name === 'max') {
    if (args.length === 0) return failureType;
    return matchingArguments(args, 1, Infinity);
  }
  if (name === 'clamp') {
    return matchingArguments(args, 3, 3);
  }
  if (name === 'mod' || name === 'rem') {
    return matchingArguments(args, 2, 2);
  }
  if (name === 'round') {
    const strategy = nodes[0];
    const hasStrategy =
      strategy?.type === 'Ident' &&
      ROUND_STRATEGIES.has(strategy.name.toLowerCase());
    const values = args.slice(hasStrategy ? 1 : 0);
    if (values.length === 1) return numberArguments(values, 1, 1);
    return matchingArguments(values, 2, 2);
  }
  if (name === 'pow') return numberArguments(args, 2, 2);
  if (name === 'atan2') {
    const type = matchingArguments(args, 2, 2);
    return isFailure(type) || type.kind === 'unknown'
      ? type
      : { kind: 'dimension', base: 'angle' };
  }
  if (name === 'hypot') {
    return matchingArguments(args, 1, Infinity);
  }
  return null;
}

/** @param {Node} node @return {CalculationType} */
function checkCalculationType(node) {
  return calculationType(node);
}

/** @param {Node} node @param {number} [depth] @return {void} */
function checkCalculationDepth(node, depth = 0) {
  if (depth > MAX_CALCULATION_DEPTH) {
    throw new CalculationLimitError(MAX_CALCULATION_DEPTH);
  }
  const children = [];
  if (node.type === 'Sum')
    children.push(...node.terms.map((term) => term.node));
  if (node.type === 'Product')
    children.push(...node.factors.map((factor) => factor.node));
  if (node.type === 'Call') {
    children.push(...node.args);
    const components = getComponents(node);
    if (components) {
      /** @param {unknown} part @param {number} partDepth */
      const visit = (part, partDepth) => {
        if (partDepth > MAX_CALCULATION_DEPTH)
          throw new CalculationLimitError(MAX_CALCULATION_DEPTH);
        if (typeof part === 'string') return;
        if (Array.isArray(part)) {
          for (const child of part) visit(child, partDepth + 1);
          return;
        }
        checkCalculationDepth(/** @type {Node} */ (part), partDepth + 1);
      };
      for (const part of components) visit(part, depth + 1);
    }
  }
  for (const child of children) checkCalculationDepth(child, depth + 1);
}

export {
  MAX_CALCULATION_DEPTH,
  CalculationLimitError,
  checkCalculationDepth,
  checkCalculationType,
};
