// Parser-only resilience test for spec-strict-rejected real-world inputs.
//
// These are calc() expressions our parser rejects because they violate the
// CSS spec — most often missing whitespace around `+`/`-` (browsers also
// reject these), mustache template placeholders that leaked into CSS files,
// malformed parens, semicolons inside calc, etc. csstools/css-calc accepts
// them leniently, which is why they show up as "we throw / they accept"
// divergences. The split-corpus script routes them here so the
// csstools-comparison conformance suite stays meaningful.
//
// Goal: every input must throw a real synchronous `Error`. No hangs, no
// non-Error throws.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCorpus, assertResilience } from '../helpers/resilience.ts';

const r = runCorpus(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'corpus',
    'github',
    'invalid.txt'
  )
);

test(`invalid corpus: ${r.total} expressions parse-or-throw cleanly`, () => {
  assertResilience(r, 'invalid', assert);
});
