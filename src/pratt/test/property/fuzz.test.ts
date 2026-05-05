// Fuzz tests. fast-check property tests already cover canonical-AST
// generation (`astArb`) and round-trip stability. What they don't cover:
//
//   1. Random byte strings hitting the tokenizer/parser. The parser is
//      where most "TypeError: Cannot read properties of undefined" bugs
//      hide — they don't show up when input is a hand-built canonical
//      AST.
//   2. Boundary cases just outside the valid-CSS region. Real-world
//      cssnano fixtures with one or two characters changed are the most
//      productive search neighborhood for parser bugs.
//   3. Metamorphic equivalences. `calc(x)` and `calc(calc(x))` should
//      simplify to the same string as `x`. If they don't, the unwrap
//      path is broken.
//
// The crash-resistance fuzzers don't assert correctness — only that the
// pipeline never throws a system-level error (TypeError / RangeError).
// Planned errors (`Expected X at position Y`, `Unexpected token`) are
// fine. Returns are fine. Crashes are not.

import { test } from 'node:test';
import fc from 'fast-check';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokenize } from '../../src/core/tokenizer.ts';
import { parse } from '../../src/core/parser.ts';
import { simplify } from '../../src/core/simplify.ts';
import { serialize } from '../../src/core/serialize.ts';
import type { Node } from '../../src/core/node.ts';
import { astArb } from '../helpers/arbitraries.ts';

const FUZZ_RUNS = 2000;

// Alphabet biased toward calc()-relevant tokens. Using a narrow alphabet
// (vs `fc.string()`'s full Unicode default) makes the search space
// productive — most random Unicode is rejected at the tokenizer with a
// boring "Unexpected token" before it can stress real logic.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz()+-*/., \t%';
const fuzzString = fc.string({
  unit: fc.constantFrom(...ALPHABET.split('')),
  minLength: 1,
  maxLength: 50,
});

function isPlannedError(error: unknown): boolean {
  // Anything that's an Error with a non-empty message and isn't a
  // system-level crash class. Parser/tokenizer/simplifier all throw
  // plain `Error`, so TypeError/RangeError indicate a coding bug.
  if (error instanceof TypeError) return false;
  if (error instanceof RangeError) return false;
  if (!(error instanceof Error)) return false;
  return typeof error.message === 'string' && error.message.length > 0;
}

function tryPipeline(input: string): { ok: boolean; planned: boolean } {
  try {
    parse(tokenize(input));
    return { ok: true, planned: true };
  } catch (error) {
    return { ok: false, planned: isPlannedError(error) };
  }
}

// --- 1. Random-string crash-resistance ---------------------------------

test('fuzz: random short strings parse cleanly or throw a planned error', () => {
  fc.assert(
    fc.property(fuzzString, (s) => tryPipeline(s).planned),
    { numRuns: FUZZ_RUNS }
  );
});

// --- 2. Mutated-corpus crash-resistance --------------------------------

const CORPUS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'corpus'
);
const corpusInputs: string[] = readdirSync(CORPUS_DIR)
  .filter((f) => f.endsWith('.txt'))
  .flatMap((f) =>
    readFileSync(join(CORPUS_DIR, f), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  );

function mutateString(
  s: string,
  op: number,
  pos: number,
  replChar: string
): string {
  if (s.length === 0) return s;
  const i = pos % s.length;
  switch (op % 5) {
    case 0:
      return s.slice(0, i) + s.slice(i + 1); // delete
    case 1:
      return s.slice(0, i) + replChar + s.slice(i + 1); // replace
    case 2:
      return s.slice(0, i) + replChar + s.slice(i); // insert
    case 3: {
      // swap adjacent
      if (i + 1 >= s.length) return s;
      return s.slice(0, i) + s[i + 1]! + s[i]! + s.slice(i + 2);
    }
    default:
      return s.replace(/[()]/g, ''); // strip all parens
  }
}

const mutatedCorpus = fc
  .tuple(
    fc.constantFrom(...corpusInputs),
    fc.integer({ min: 0, max: 10 }),
    fc.integer({ min: 0, max: 10000 }),
    fc.constantFrom(...ALPHABET.split(''))
  )
  .map(([s, op, pos, ch]) => mutateString(s, op, pos, ch));

test('fuzz: mutated cssnano corpus parses cleanly or throws planned error', () => {
  fc.assert(
    fc.property(mutatedCorpus, (s) => tryPipeline(s).planned),
    { numRuns: FUZZ_RUNS }
  );
});

// --- 3. Metamorphic equivalence ----------------------------------------
//
// `calc(x)` is the identity wrap per §10.1; `calc(calc(x))` is the
// double-wrap. The simplifier MUST collapse both to the same form as `x`.

const out = (n: Node): string => serialize(simplify(n), { precision: 10 });

test('metamorphic: calc(x) simplifies to the same string as x', () => {
  fc.assert(
    fc.property(astArb(3), (ast) => {
      const direct = out(ast);
      const wrapped = out({ type: 'Call', name: 'calc', args: [ast] });
      return direct === wrapped;
    }),
    { numRuns: FUZZ_RUNS }
  );
});

test('metamorphic: calc(calc(x)) simplifies to the same string as x', () => {
  fc.assert(
    fc.property(astArb(3), (ast) => {
      const direct = out(ast);
      const doubled = out({
        type: 'Call',
        name: 'calc',
        args: [{ type: 'Call', name: 'calc', args: [ast] }],
      });
      return direct === doubled;
    }),
    { numRuns: FUZZ_RUNS }
  );
});

test('metamorphic: vendor-prefixed calc unwraps to the same string', () => {
  // simplifyCall handles `-webkit-calc` / `-moz-calc` identically to `calc`
  // (see simplify.ts ~line 296). Random ASTs wrapped in either prefix
  // should simplify to the same canonical form.
  fc.assert(
    fc.property(
      astArb(3),
      fc.constantFrom('calc', '-webkit-calc', '-moz-calc'),
      (ast, name) => {
        const direct = out(ast);
        const wrapped = out({ type: 'Call', name, args: [ast] });
        return direct === wrapped;
      }
    ),
    { numRuns: FUZZ_RUNS }
  );
});
