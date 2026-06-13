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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calc as csstoolsCalc } from '@csstools/css-calc';
import { out } from '../helpers/out.mjs';
const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../corpus');
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
const libraries = readdirSync(CORPUS_DIR)
  .filter((f) => f.endsWith('.txt'))
  .sort((a, b) => a.localeCompare(b));
const results = [];
for (const file of libraries) {
  const lib = file.replace(/\.txt$/, '');
  const calcs = readFileSync(join(CORPUS_DIR, file), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  results.push(runLibrary(lib, calcs));
}
// --- Per-library tests -----------------------------------------------------
for (const r of results) {
  test(`corpus: ${r.lib} — ${r.total} expressions`, () => {
    if (r.divergences.length > 0) {
      const sample = r.divergences
        .slice(0, 5)
        .map(
          (d) =>
            `  input:  ${d.input}\n  ours:   ${d.ours}\n  theirs: ${d.theirs}`
        )
        .join('\n\n');
      assert.fail(
        `${r.divergences.length} / ${r.total} diverge from csstools in ${r.lib} ` +
          `(showing first 5):\n\n${sample}`
      );
    }
    assert.ok(true, `${r.agree}/${r.total} agree`);
  });
}
// --- Summary --------------------------------------------------------------
test('corpus: overall summary', () => {
  const total = results.reduce((a, r) => a + r.total, 0);
  const agree = results.reduce((a, r) => a + r.agree, 0);
  const diverge = results.reduce((a, r) => a + r.divergences.length, 0);
  const both = results.reduce((a, r) => a + r.bothFailed, 0);
  console.log(
    `\n  corpus totals: ${agree}/${total} agree, ${diverge} diverge, ${both} both-failed`
  );
  assert.equal(
    diverge,
    0,
    `${diverge} undocumented divergences across the corpus`
  );
});
