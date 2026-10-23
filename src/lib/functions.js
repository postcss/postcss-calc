import { TokenType as CssType } from '@csstools/css-tokenizer';
import { simplifyMinMax } from './simplify/min-max.js';
import { simplifyClamp } from './simplify/clamp.js';
import { simplifyModRem } from './simplify/mod-rem.js';
import { simplifyRound } from './simplify/round.js';
import { simplifyTrig } from './simplify/trig.js';
import { simplifyInverseTrig } from './simplify/inverse-trig.js';
import { simplifyAtan2 } from './simplify/atan2.js';
import { simplifyHypot } from './simplify/hypot.js';
import {
  simplifyAbs,
  simplifyExp,
  simplifyLog,
  simplifyPow,
  simplifySign,
  simplifySqrt,
} from './simplify/numeric.js';
import {
  analyzeAtan2,
  analyzeClamp,
  analyzeIdentity,
  analyzeInverseTrig,
  analyzeRound,
  analyzeSign,
  analyzeTrig,
  isRoundStrategy,
} from './function-analyzers.js';
import { isClampKeyword } from './keywords.js';
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
/** @typedef {(args: Node[], name: string) => Node} MathSimplifier */
/** @typedef {(args: CalculationType[], nodes: Node[]) => CalculationType} TypeAnalyzer */
/** @typedef {{analyze: TypeAnalyzer, simplify?: MathSimplifier, isKeyword?: (node: Node, index: number) => boolean, calculation?: boolean}} MathFunction */

const mathFunctions = new Map(
  /** @type {[string, MathFunction][]} */ ([
    ['calc', { analyze: analyzeIdentity, calculation: true }],
    ['-webkit-calc', { analyze: analyzeIdentity, calculation: true }],
    ['-moz-calc', { analyze: analyzeIdentity, calculation: true }],
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
        simplify: simplifyClamp,
        isKeyword: isClampKeyword,
      },
    ],
    [
      'abs',
      {
        analyze: analyzeIdentity,
        simplify: simplifyAbs,
      },
    ],
    [
      'sign',
      {
        analyze: analyzeSign,
        simplify: simplifySign,
      },
    ],
    [
      'mod',
      {
        analyze: (args) => matchingArguments(args, 2, 2),
        simplify: simplifyModRem,
      },
    ],
    [
      'rem',
      {
        analyze: (args) => matchingArguments(args, 2, 2),
        simplify: simplifyModRem,
      },
    ],
    [
      'round',
      {
        analyze: analyzeRound,
        simplify: simplifyRound,
        isKeyword: (node, index) => index === 0 && isRoundStrategy(node),
      },
    ],
    [
      'sin',
      {
        analyze: analyzeTrig,
        simplify: simplifyTrig,
      },
    ],
    [
      'cos',
      {
        analyze: analyzeTrig,
        simplify: simplifyTrig,
      },
    ],
    [
      'tan',
      {
        analyze: analyzeTrig,
        simplify: simplifyTrig,
      },
    ],
    [
      'asin',
      {
        analyze: analyzeInverseTrig,
        simplify: simplifyInverseTrig,
      },
    ],
    [
      'acos',
      {
        analyze: analyzeInverseTrig,
        simplify: simplifyInverseTrig,
      },
    ],
    [
      'atan',
      {
        analyze: analyzeInverseTrig,
        simplify: simplifyInverseTrig,
      },
    ],
    [
      'atan2',
      {
        analyze: analyzeAtan2,
        simplify: simplifyAtan2,
      },
    ],
    [
      'pow',
      {
        analyze: (args) => numberArguments(args, 2, 2),
        simplify: simplifyPow,
      },
    ],
    [
      'sqrt',
      {
        analyze: (args) => numberArguments(args, 1, 1),
        simplify: simplifySqrt,
      },
    ],
    [
      'hypot',
      {
        analyze: (args) => matchingArguments(args, 1, Infinity),
        simplify: simplifyHypot,
      },
    ],
    [
      'log',
      {
        analyze: (args) => numberArguments(args, 1, 2),
        simplify: simplifyLog,
      },
    ],
    [
      'exp',
      {
        analyze: (args) => numberArguments(args, 1, 1),
        simplify: simplifyExp,
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

/** @param {string} value @return {boolean} */
function hasPotentialMathFunction(value) {
  return (
    value.includes('(') && (QUICK_MATH_TEST.test(value) || value.includes('\\'))
  );
}

/**
 * Token-level counterpart of `hasPotentialMathFunction`: whether any function
 * token names a supported math function, as the scanner would find it. Math
 * functions inside `url()` and similar are part of another token.
 *
 * @param {import('@csstools/css-tokenizer').CSSToken[]} tokens
 * @return {boolean}
 */
function hasMathFunctionToken(tokens) {
  for (const token of tokens) {
    if (token[0] === CssType.Function && lookupMathFunction(token[4].value)) {
      return true;
    }
  }
  return false;
}

/**
 * The supported math function named by the function token at `index`, or
 * `undefined` when that token is not a supported math function.
 *
 * @param {import('@csstools/css-tokenizer').CSSToken[]} tokens
 * @param {number} index
 * @return {ReturnType<typeof lookupMathFunction>}
 */
function mathFunctionAt(tokens, index) {
  const token = tokens[index];
  return token[0] === CssType.Function
    ? lookupMathFunction(token[4].value)
    : undefined;
}

export {
  addTypes,
  failureType,
  hasMathFunctionToken,
  hasPotentialMathFunction,
  isCalculationFunction,
  isFailure,
  isPercentage,
  lookupMathFunction,
  mathFunctionAt,
  mathFunctions,
  numberType,
  percentageType,
  QUICK_MATH_TEST,
  unknownType,
};
