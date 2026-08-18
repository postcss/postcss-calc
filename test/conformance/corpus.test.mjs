// Real-world corpus test.
//
// Inputs are every unique `calc(...)` expression extracted from cssnano's
// integration CSS fixtures (Bootstrap, Bulma, Foundation, Milligram,
// Picnic, Semantic UI, Turret, UIkit). The corpus is committed under
// `corpus/` so the test is self-contained — no sibling-repo dependency.
//
// For each expression we run both our pipeline and `@csstools/css-calc`,
// canonicalize the outputs through our parser at a shared precision, and
// assert they agree. Any divergence is either a real bug or a known
// design choice documented in `KNOWN_DIVERGENCES`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calc as csstoolsCalc } from '@csstools/css-calc';
import { out } from '../helpers/out.mjs';
import {
  ROUTINE_CORPUS_TARGET,
  selectCorpusExpressions,
  stableHash,
} from '../helpers/corpus-selection.mjs';
const CORPUS_DIR = fileURLToPath(new URL('../corpus/', import.meta.url));
const COMPARE_PRECISION = 10;
function ourOut(input) {
  try {
    return out(input, { precision: COMPARE_PRECISION });
  } catch {
    return null;
  }
}
function theirOut(input) {
  try {
    const r = csstoolsCalc(input);
    return typeof r === 'string' ? r : null;
  } catch {
    return null;
  }
}
/**
 * Documented divergences from csstools that we accept. Each entry is an
 * INPUT string; the comment explains the chosen behavior. Adding a case
 * here means the design choice is deliberate — not a workaround.
 */
const KNOWN_DIVERGENCES = new Set([
  // Mixed-unit angle sum: when an inverse trig function output (radians)
  // is summed with degrees, we fold to a single deg-unit constant
  // (`atan(.5) + 90deg` → `116.5650511771deg`); csstools keeps the rad+deg
  // sum un-folded. Both outputs represent the same angle. Our choice
  // matches the rest of our angle-serialization (degrees), and once the
  // numeric folding is done the sum can't be expressed without a unit
  // choice anyway.
  'calc(atan(.5) + 90deg - (var(--dir)*90deg))',
  // Emoji/math-symbol custom properties: the current CSS Syntax draft
  // excludes these code points from idents, so `--➕` splits and we warn +
  // preserve; css-calc silently passes through. Same output either way.
  'calc(1 / var(--√𝟤))',
  'calc(var(--➕) * -1)',
  'calc(var(--➕) * var(--✖️))',
  'calc(var(--➖) * var(--✖️))',
]);
function runLibrary(lib, calcs) {
  const result = {
    lib,
    total: calcs.length,
    agree: 0,
    bothFailed: 0,
    divergences: [],
  };
  for (const input of calcs) {
    const ours = ourOut(input);
    const theirs = theirOut(input);
    if (ours === null && theirs === null) {
      result.bothFailed++;
      continue;
    }
    if (ours === null || theirs === null) {
      if (!KNOWN_DIVERGENCES.has(input)) {
        result.divergences.push({
          input,
          ours: ours ?? '<threw>',
          theirs: theirs ?? '<threw>',
        });
      }
      continue;
    }
    if (ours === theirs) {
      result.agree++;
      continue;
    }
    const canonicalTheirs = ourOut(theirs);
    if (canonicalTheirs === null) {
      // csstools produced something our parser couldn't read — rare.
      if (!KNOWN_DIVERGENCES.has(input)) {
        result.divergences.push({ input, ours, theirs });
      }
      continue;
    }
    if (ours === canonicalTheirs) {
      result.agree++;
      continue;
    }
    if (!KNOWN_DIVERGENCES.has(input)) {
      result.divergences.push({ input, ours, theirs });
    }
  }
  return result;
}
const corpusFiles = readdirSync(CORPUS_DIR)
  .filter((f) => f.endsWith('.txt'))
  .sort((a, b) => a.localeCompare(b))
  .map((file) => join(CORPUS_DIR, file));
// github/expressions.txt is the harvested valid-expression pool. Its sibling
// invalid.txt and preprocessor.txt intentionally stay in their dedicated
// resilience suites rather than being discarded by the sampler.
corpusFiles.push(join(CORPUS_DIR, 'github', 'expressions.txt'));
const allCalcs = [];
for (const file of corpusFiles) {
  allCalcs.push(
    ...readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  );
}

const fullCorpus = process.env.POSTCSS_CALC_FULL_CORPUS === '1';
const selection = selectCorpusExpressions(allCalcs);
const inputs = fullCorpus ? selection.allInputs : selection.routineInputs;
const result = runLibrary(fullCorpus ? 'full' : 'sample', inputs);
const parserRejectedHash = stableHash(selection.parserRejected.join('\n'));
const parserRejectedAcceptedByCsstools = selection.parserRejected.filter(
  (input) => theirOut(input) !== null
);

// These are Sass/preprocessor and malformed inputs harvested by the GitHub
// pool. They are checked separately because css-calc passes them through,
// while this package intentionally rejects them as non-CSS expressions.
const EXPECTED_PARSER_REJECTED_COUNT = 2325;
const EXPECTED_PARSER_REJECTED_HASH = 4011635432;
const EXPECTED_PARSER_REJECTED_ACCEPTED_BY_CSSTOOLS = 2325;

test(`corpus: ${fullCorpus ? 'full' : 'structural sample'} differential`, () => {
  if (!fullCorpus) {
    assert.ok(
      selection.selected.length >= 5000 && selection.selected.length <= 8000,
      `routine corpus sample must stay in the 5,000–8,000 budget; got ${selection.selected.length}`
    );
    assert.equal(selection.selected.length, ROUTINE_CORPUS_TARGET);
  }
  if (result.divergences.length > 0) {
    const sample = result.divergences
      .slice(0, 5)
      .map(
        (d) =>
          `  input:  ${d.input}\n  ours:   ${d.ours}\n  theirs: ${d.theirs}`
      )
      .join('\n\n');
    assert.fail(
      `${result.divergences.length} / ${result.total} diverge from csstools ` +
        `(showing first 5):\n\n${sample}`
    );
  }
  console.log(
    `\n  corpus ${fullCorpus ? 'full' : 'sample'}: ${result.agree}/${result.total} agree, ` +
      `${result.divergences.length} diverge, ${result.bothFailed} both-failed ` +
      `(eligible ${selection.eligible}/${selection.total})`
  );
});

test('corpus: parser-rejected inputs remain accounted for', () => {
  assert.equal(selection.parserRejected.length, EXPECTED_PARSER_REJECTED_COUNT);
  assert.equal(parserRejectedHash, EXPECTED_PARSER_REJECTED_HASH);
  assert.equal(
    parserRejectedAcceptedByCsstools.length,
    EXPECTED_PARSER_REJECTED_ACCEPTED_BY_CSSTOOLS
  );
});
