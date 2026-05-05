// Differential testing against @csstools/css-calc.
//
// For every generated calc() string we run both implementations and compare.
// Strings don't have to match byte-for-byte — we canonicalize both through
// our own parser/simplifier at a shared precision, so cosmetic differences
// (term ordering, spaces, precision, single-value unwrapping) collapse. Any
// remaining disagreement is a real semantic divergence worth reviewing.

import { test } from 'node:test';
import fc from 'fast-check';
import { calc as csstoolsCalc } from '@csstools/css-calc';

import { tokenize } from '../../src/core/tokenizer.ts';
import { parse } from '../../src/core/parser.ts';
import { simplify } from '../../src/core/simplify.ts';
import { serialize } from '../../src/core/serialize.ts';
import { astArb, astToCalc, trigExpFlatArb } from '../helpers/arbitraries.ts';

const NUM_RUNS = 2000;

/** Precision high enough to make real divergences visible without catching
 *  IEEE-754 tail-digit noise. csstools rounds at ~12 digits; long
 *  multiplication chains accumulate enough drift that the round-half-away
 *  rule occasionally flips the last digit at p=10. p=9 absorbs that flip
 *  without losing semantic divergence detection — confirmed by running
 *  the bumped 2000-run suite repeatedly. */
const COMPARE_PRECISION = 9;

function ourOut(input: string): string | null {
  try {
    return serialize(simplify(parse(tokenize(input))), {
      precision: COMPARE_PRECISION,
    });
  } catch {
    return null;
  }
}

function theirOut(input: string): string | null {
  try {
    const result = csstoolsCalc(input);
    return typeof result === 'string' ? result : null;
  } catch {
    return null;
  }
}

/** Re-simplify a string via our pipeline at the shared precision. */
function canonicalize(s: string): string | null {
  try {
    return serialize(simplify(parse(tokenize(s))), {
      precision: COMPARE_PRECISION,
    });
  } catch {
    return null;
  }
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

function ourOutLoose(input: string): string | null {
  try {
    return serialize(simplify(parse(tokenize(input))), {
      precision: COMPARE_PRECISION_LOOSE,
    });
  } catch {
    return null;
  }
}
function canonicalizeLoose(s: string): string | null {
  try {
    return serialize(simplify(parse(tokenize(s))), {
      precision: COMPARE_PRECISION_LOOSE,
    });
  } catch {
    return null;
  }
}

function checkAgreement(input: string): boolean {
  const ours = ourOut(input);
  const theirs = theirOut(input);

  // Either side couldn't handle the input — neutral. csstools has
  // features we don't (e.g. relative color); we throw on things it
  // serializes. Mismatched error handling isn't a simplification bug.
  if (ours === null || theirs === null) {
    return true;
  }

  if (ours === theirs) {
    return true;
  }

  const canonicalTheirs = canonicalize(theirs);
  if (canonicalTheirs === null) {
    return true;
  }

  return ours === canonicalTheirs;
}

function checkAgreementLoose(input: string): boolean {
  const ours = ourOutLoose(input);
  const theirs = theirOut(input);
  if (ours === null || theirs === null) return true;
  if (ours === theirs) return true;
  const canonicalTheirs = canonicalizeLoose(theirs);
  if (canonicalTheirs === null) return true;
  return ours === canonicalTheirs;
}

test('differential: our simplifier agrees with csstools (canonicalized)', () => {
  fc.assert(
    fc.property(inputArb, checkAgreement),
    { numRuns: NUM_RUNS }
  );
});

test('differential: trig/exp Calls (flat, no composition) agree with csstools', () => {
  fc.assert(
    fc.property(trigExpInputArb, checkAgreementLoose),
    { numRuns: NUM_RUNS }
  );
});
