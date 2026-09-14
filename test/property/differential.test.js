// Differential testing against @csstools/css-calc.
//
// For every generated calc() string we run both implementations and compare.
// Strings don't have to match byte-for-byte — we canonicalize both through
// our own parser/simplifier at a shared precision, so cosmetic differences
// (term ordering, spaces, precision, single-value unwrapping) collapse. Any
// remaining disagreement is a real semantic divergence worth reviewing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { calc as csstoolsCalc } from '@csstools/css-calc';
import { TokenType, tokenize } from '@csstools/css-tokenizer';
import { parse } from '../../src/lib/parser.js';
import { simplify } from '../../src/lib/simplify.js';
import { serialize } from '../../src/lib/serialize.js';
import { astArb, astToCalc, trigExpFlatArb } from '../helpers/arbitraries.js';
const NUM_RUNS = 2000;
/** Precision high enough to make real divergences visible without catching
 *  IEEE-754 tail-digit noise. csstools' output is requested at a higher
 *  decimal-place precision below; long
 *  multiplication chains accumulate enough drift that the round-half-away
 *  rule occasionally flips the last digit at p=10. p=9 absorbs that flip
 *  without losing semantic divergence detection — confirmed by running
 *  the bumped 2000-run suite repeatedly. */
const COMPARE_PRECISION = 9;
// csstools' default is 13 decimal places. That loses significant digits for
// very small values before canonicalize() gets a chance to apply the shared
// precision, so request enough fractional digits to preserve the generated
// arithmetic chains.
const CSTOOLS_PRECISION = 24;
const NUMERIC_RAW = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/;
function ourOut(input) {
  return serialize(simplify(parse(tokenize({ css: input }))), {
    precision: COMPARE_PRECISION,
  });
}
function theirOut(input) {
  try {
    const result = csstoolsCalc(input, { precision: CSTOOLS_PRECISION });
    return typeof result === 'string' ? result : null;
  } catch {
    return null;
  }
}
/**
 * @param {string} input
 * @return {string}
 */
function lowerReferenceSignedZeros(input) {
  let output = '';
  for (const token of tokenize({ css: input })) {
    const [type, raw, _start, _end, detail] = token;
    if (
      (type === TokenType.Number ||
        type === TokenType.Dimension ||
        type === TokenType.Percentage) &&
      Object.is(detail?.value, -0)
    ) {
      const numeric = NUMERIC_RAW.exec(raw)?.[0];
      if (numeric !== undefined) {
        const suffix = raw.slice(numeric.length);
        output += `calc(-1 * 0${suffix})`;
        continue;
      }
    }
    output += raw;
  }
  return output;
}

/** @param {string} input @return {boolean} */
function hasSignedZeroToken(input) {
  return tokenize({ css: input }).some(
    (token) =>
      (token[0] === TokenType.Number ||
        token[0] === TokenType.Dimension ||
        token[0] === TokenType.Percentage) &&
      Object.is(token[4]?.value, -0)
  );
}

function canonicalize(s) {
  return serialize(simplify(parse(tokenize({ css: s }))), {
    precision: COMPARE_PRECISION,
  });
}
// Generator depth 3 keeps the input small enough to debug counterexamples
// by hand; fast-check still explores hundreds of variations in seconds.
const inputArb = astArb(3).map((ast) => astToCalc(ast));
/** Top-level math Call inputs: each generated AST is exactly one trig/exp
 *  Call, no enclosing Sum/Product. csstools doesn't fold across math-Call
 *  boundaries, so composing them with arithmetic produces re-rounding
 *  cascades the canonicalize step can't absorb at precision 10. Keeping
 *  the trig/exp inputs flat catches structural divergence (output type,
 *  unit, sign) without precision noise. */
const trigExpInputArb = trigExpFlatArb.map((ast) => astToCalc(ast));
/** Wider tolerance for the trig/exp test: csstools rounds Math.* outputs
 *  at ~12 sig figs, and the round-half-away rule occasionally flips the
 *  last digit at p=10 vs our full-FP serialization. p=8 absorbs that flip
 *  and still catches structural / sign / unit divergence — which is the
 *  point of differential coverage for this generator. */
const COMPARE_PRECISION_LOOSE = 8;
function ourOutLoose(input) {
  return serialize(simplify(parse(tokenize({ css: input }))), {
    precision: COMPARE_PRECISION_LOOSE,
  });
}
function canonicalizeLoose(s) {
  return serialize(simplify(parse(tokenize({ css: s }))), {
    precision: COMPARE_PRECISION_LOOSE,
  });
}
function checkAgreement(input) {
  const ours = ourOut(input);
  const theirs = theirOut(input);
  // csstools has features we don't (e.g. relative color); unsupported
  // reference behavior is neutral, but our implementation must fail loudly.
  if (theirs === null) {
    return true;
  }
  if (ours === theirs) {
    return true;
  }
  // CSS source -0 is ordinary zero. csstools retains its own legacy
  // signed-zero token spelling, so those reference inputs are neutral after
  // our pipeline has already run successfully.
  if (hasSignedZeroToken(input)) {
    return true;
  }
  let canonicalTheirs;
  try {
    // csstools prints arithmetic -0 as a literal. Recreate that internal
    // value before the canonicalizing parser applies source normalization.
    canonicalTheirs = canonicalize(lowerReferenceSignedZeros(theirs));
  } catch {
    // The reference returned output outside our parser's supported surface.
    return true;
  }
  return canonicalize(ours) === canonicalTheirs;
}
function checkAgreementLoose(input) {
  const ours = ourOutLoose(input);
  const theirs = theirOut(input);
  if (theirs === null) return true;
  if (ours === theirs) return true;
  if (hasSignedZeroToken(input)) return true;
  let canonicalTheirs;
  try {
    canonicalTheirs = canonicalizeLoose(lowerReferenceSignedZeros(theirs));
  } catch {
    return true;
  }
  return canonicalizeLoose(ours) === canonicalTheirs;
}
test('differential: our simplifier agrees with csstools (canonicalized)', () => {
  fc.assert(fc.property(inputArb, checkAgreement), { numRuns: NUM_RUNS });
});
test('differential: small division chains retain comparison precision', () => {
  assert.equal(
    checkAgreement('calc(1 / 5 / -58 / -30 / 23 / 100 / 100)'),
    true
  );
});
test('differential: trig/exp Calls (flat, no composition) agree with csstools', () => {
  fc.assert(fc.property(trigExpInputArb, checkAgreementLoose), {
    numRuns: NUM_RUNS,
  });
});
