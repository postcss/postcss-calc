import { simplifyMinMax } from './simplify/min-max.js';
import { simplifyClamp } from './simplify/clamp.js';
import { simplifyAbs } from './simplify/abs.js';
import { simplifySign } from './simplify/sign.js';
import { simplifyModRem } from './simplify/mod-rem.js';
import { simplifyRound } from './simplify/round.js';
import { simplifyTrig } from './simplify/trig.js';
import { simplifyInverseTrig } from './simplify/inverse-trig.js';
import { simplifyAtan2 } from './simplify/atan2.js';
import { simplifyPow } from './simplify/pow.js';
import { simplifySqrt } from './simplify/sqrt.js';
import { simplifyExp } from './simplify/exp.js';
import { simplifyLog } from './simplify/log.js';
import { simplifyHypot } from './simplify/hypot.js';
import {
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
} from './function-analyzers.js';
import {
  addTypes,
  failureType,
  isFailure,
  isPercentage,
  matchingArguments,
  numberArguments,
  numberType,
  percentageType,
  unknownType,
} from './types.js';

/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./types.js').CalculationType} CalculationType */
/** @typedef {(name: string, args: Node[]) => Node} MathSimplifier */
/** @typedef {(args: CalculationType[], nodes: Node[]) => CalculationType} TypeAnalyzer */
/** @typedef {{analyze: TypeAnalyzer, simplify?: MathSimplifier, isKeyword?: (node: Node, index: number) => boolean, calculation?: boolean}} MathFunction */

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
  failureType,
  hasPotentialMathFunction,
  isCalculationFunction,
  isFailure,
  isPercentage,
  isSupportedMathFunction,
  lookupMathFunction,
  mathFunctions,
  numberType,
  percentageType,
  QUICK_MATH_TEST,
  unknownType,
};
