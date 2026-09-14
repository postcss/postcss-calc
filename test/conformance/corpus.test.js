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
import {
  classifyCorpusExpression,
  NEUTRAL_CORPUS_CATEGORIES,
  referenceOutput,
} from '../../scripts/lib/corpus-policy.js';
import {
  ROUTINE_CORPUS_TARGET,
  selectCorpusExpressions,
  stableHash,
} from '../helpers/corpus-selection.js';
const CORPUS_DIR = fileURLToPath(new URL('../corpus/', import.meta.url));
function runLibrary(lib, calcs) {
  const result = {
    lib,
    total: calcs.length,
    agree: 0,
    bothFailed: 0,
    referenceRejected: 0,
    divergences: [],
  };
  for (const input of calcs) {
    const comparison = classifyCorpusExpression(input);
    if (comparison.category === 'both-failed') {
      result.bothFailed++;
      continue;
    }
    if (comparison.category === 'accepted') {
      result.agree++;
      continue;
    }
    if (NEUTRAL_CORPUS_CATEGORIES.has(comparison.category)) {
      if (comparison.category === 'reference-rejected')
        result.referenceRejected++;
      continue;
    }
    result.divergences.push({
      input,
      ours: comparison.ours ?? '<threw>',
      theirs: comparison.theirs ?? '<threw>',
    });
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
  (input) => referenceOutput(input) !== null
);

// These are Sass/preprocessor and malformed inputs harvested from GitHub.
// They are checked separately because css-calc passes them through,
// while this package intentionally rejects them as non-CSS expressions.
const EXPECTED_PARSER_REJECTED_COUNT = 2282;
const EXPECTED_PARSER_REJECTED_HASH = 895423645;
const EXPECTED_PARSER_REJECTED_ACCEPTED_BY_CSSTOOLS = 2282;

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
