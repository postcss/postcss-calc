// Parser-only resilience test against real-world preprocessor (SCSS/Less)
// `calc(...)` expressions harvested from public GitHub repos. Asserts every
// input parses or throws cleanly — no hangs, no non-Error throws.
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCorpus, assertResilience } from '../helpers/resilience.mjs';
const r = runCorpus(
  fileURLToPath(new URL('../corpus/github/preprocessor.txt', import.meta.url))
);
test(`preprocessor corpus: ${r.total} expressions parse-or-throw cleanly`, () => {
  assertResilience(r, 'preprocessor', assert);
});
