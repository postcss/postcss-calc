import { simplifyMinMax } from './simplify/min-max.js';
import { simplifyClamp } from './simplify/clamp.js';
import { simplifyAbs } from './simplify/abs.js';
import { simplifySign } from './simplify/sign.js';
import { simplifyModRem } from './simplify/mod-rem.js';
import { ROUND_STRATEGIES, simplifyRound } from './simplify/round.js';
import { simplifyTrig } from './simplify/trig.js';
import { simplifyInverseTrig } from './simplify/inverse-trig.js';
import { simplifyAtan2 } from './simplify/atan2.js';
import { simplifyPow } from './simplify/pow.js';
import { simplifySqrt } from './simplify/sqrt.js';
import { simplifyExp } from './simplify/exp.js';
import { simplifyLog } from './simplify/log.js';
import { simplifyHypot } from './simplify/hypot.js';

/** @typedef {import('./node.js').Node} Node */
/** @typedef {{kind: 'number'} | {kind: 'dimension', base: string | null} | {kind: 'unknown'} | {kind: 'failure'}} CalculationType */
/** @typedef {(name: string, args: Node[]) => Node} MathSimplifier */
/** @typedef {(args: CalculationType[], nodes: Node[]) => CalculationType} TypeAnalyzer */
/** @typedef {{analyze: TypeAnalyzer, simplify?: MathSimplifier, isKeyword?: (node: Node, index: number) => boolean, calculation?: boolean}} MathFunction */

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
  let hasUnknown = false;
  for (const arg of args) {
    if (arg.kind === 'dimension') return failureType;
    hasUnknown = hasUnknown || arg.kind === 'unknown';
  }
  return hasUnknown ? unknownType : numberType;
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
  for (let index = 1; index < args.length; index++) {
    result = addTypes(result, args[index]);
    if (isFailure(result)) return failureType;
  }
  return result;
}

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
  return isFailure(type) || type.kind === 'unknown'
    ? type
    : { kind: 'dimension', base: 'angle' };
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

const mathFunctions = new Map(
  /** @type {[string, MathFunction][]} */ ([
    ['calc', { analyze: analyzeCalc, calculation: true }],
    ['-webkit-calc', { analyze: analyzeCalc, calculation: true }],
    ['-moz-calc', { analyze: analyzeCalc, calculation: true }],
    [
      'min',
      {
        analyze: (args) => matchingArguments(args, 1, Infinity),
        simplify: simplifyMinMax,
      },
    ],
    [
      'max',
      {
        analyze: (args) => matchingArguments(args, 1, Infinity),
        simplify: simplifyMinMax,
      },
    ],
    [
      'clamp',
      {
        analyze: analyzeClamp,
        simplify: (_name, args) => simplifyClamp(args),
        isKeyword: isClampKeyword,
      },
    ],
    [
      'abs',
      {
        analyze: analyzeIdentity,
        simplify: (_name, args) => simplifyAbs(args),
      },
    ],
    [
      'sign',
      {
        analyze: analyzeSign,
        simplify: (_name, args) => simplifySign(args),
      },
    ],
    [
      'mod',
      {
        analyze: (args) => matchingArguments(args, 2, 2),
        simplify: (_name, args) => simplifyModRem('mod', args),
      },
    ],
    [
      'rem',
      {
        analyze: (args) => matchingArguments(args, 2, 2),
        simplify: (_name, args) => simplifyModRem('rem', args),
      },
    ],
    [
      'round',
      {
        analyze: analyzeRound,
        simplify: (_name, args) => simplifyRound(args),
        isKeyword: (node, index) => index === 0 && isRoundStrategy(node),
      },
    ],
    [
      'sin',
      {
        analyze: analyzeTrig,
        simplify: (_name, args) => simplifyTrig('sin', args),
      },
    ],
    [
      'cos',
      {
        analyze: analyzeTrig,
        simplify: (_name, args) => simplifyTrig('cos', args),
      },
    ],
    [
      'tan',
      {
        analyze: analyzeTrig,
        simplify: (_name, args) => simplifyTrig('tan', args),
      },
    ],
    [
      'asin',
      {
        analyze: analyzeInverseTrig,
        simplify: (_name, args) => simplifyInverseTrig('asin', args),
      },
    ],
    [
      'acos',
      {
        analyze: analyzeInverseTrig,
        simplify: (_name, args) => simplifyInverseTrig('acos', args),
      },
    ],
    [
      'atan',
      {
        analyze: analyzeInverseTrig,
        simplify: (_name, args) => simplifyInverseTrig('atan', args),
      },
    ],
    [
      'atan2',
      {
        analyze: analyzeAtan2,
        simplify: (_name, args) => simplifyAtan2(args),
      },
    ],
    [
      'pow',
      {
        analyze: (args) => numberArguments(args, 2, 2),
        simplify: (_name, args) => simplifyPow(args),
      },
    ],
    [
      'sqrt',
      {
        analyze: (args) => numberArguments(args, 1, 1),
        simplify: (_name, args) => simplifySqrt(args),
      },
    ],
    [
      'hypot',
      {
        analyze: (args) => matchingArguments(args, 1, Infinity),
        simplify: (_name, args) => simplifyHypot(args),
      },
    ],
    [
      'log',
      {
        analyze: (args) => numberArguments(args, 1, 2),
        simplify: (_name, args) => simplifyLog(args),
      },
    ],
    [
      'exp',
      {
        analyze: (args) => numberArguments(args, 1, 1),
        simplify: (_name, args) => simplifyExp(args),
      },
    ],
  ])
);

/**
 * @param {string} name
 * @return {{normalizedName: string, definition: MathFunction} | undefined}
 */
function lookupMathFunction(name) {
  const normalizedName = name.toLowerCase();
  const definition = mathFunctions.get(normalizedName);
  return definition === undefined ? undefined : { normalizedName, definition };
}

const mathFunctionNames = [...mathFunctions.keys()];
const QUICK_MATH_TEST = new RegExp(
  `(?:${mathFunctionNames.join('|')})\\(`,
  'i'
);

/** @param {string} name @return {boolean} */
function isCalculationFunction(name) {
  return mathFunctions.get(name.toLowerCase())?.calculation === true;
}

/** @param {string} name @return {boolean} */
function isSupportedMathFunction(name) {
  const normalizedName = name.toLowerCase();
  const definition = mathFunctions.get(normalizedName);
  return definition !== undefined && definition.calculation !== true;
}

/** @param {string} value @return {boolean} */
function hasPotentialMathFunction(value) {
  return (
    value.includes('(') && (QUICK_MATH_TEST.test(value) || value.includes('\\'))
  );
}

export {
  addTypes,
  mathFunctions,
  lookupMathFunction,
  QUICK_MATH_TEST,
  isFailure,
  isCalculationFunction,
  isSupportedMathFunction,
  hasPotentialMathFunction,
};
