# scripts/

None of these run in `pnpm test` or CI — run directly with `node scripts/<name>.mjs`.

- **`harvest-github.mjs`** — scrapes real-world `calc()` expressions from
  public GitHub into `test/corpus/github/expressions.txt`.
- **`split-corpus.mjs`** — splits that file into `github-pure.txt` (feeds
  `benchmark.mjs`/`show-divergences.mjs` below), `preprocessor.txt`, and
  `invalid.txt` (the latter two are used by real CI resilience tests).
- **`lib/corpus.mjs`** — shared loader for `github-pure.txt`.
- **`benchmark.mjs`** — times our pipeline against `@csstools/css-calc` over
  the pure corpus.
- **`show-divergences.mjs`** — buckets where our output disagrees with
  `@csstools/css-calc` over the pure corpus, for manual triage.
- **`tokenizer-compat.mjs`** — shared helpers for diffing token streams
  (not runnable on its own); used by `tokenizer-suite.mjs`.
- **`tokenizer-suite.mjs`** — runs the official `@rmenke/css-tokenizer-tests`
  corpus through our tokenizer and reports pass/fail per category.
- **`randomizer.mjs`** — long-running fuzzer: generates `calc()` inputs at
  increasing depth, compares against `@csstools/css-calc`, logs finds to
  `reports/randomizer-finds.jsonl`.
