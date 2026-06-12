// Parser-only resilience test against real-world preprocessor (SCSS/Less)
// `calc(...)` expressions harvested from public GitHub repos. Asserts every
// input parses or throws cleanly — no hangs, no non-Error throws.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCorpus, assertResilience } from '../helpers/resilience.mjs';
const r = runCorpus(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'corpus',
    'github',
    'preprocessor.txt'
  )
);
test(`preprocessor corpus: ${r.total} expressions parse-or-throw cleanly`, () => {
  assertResilience(r, 'preprocessor', assert);
});
