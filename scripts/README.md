# scripts/

None of these run in `pnpm test` or CI — run directly with `node scripts/<name>.js`.

- **`benchmark-arithmetic-chains.js`** — times parser construction and flattening across long arithmetic chains.
- **`benchmark-nested-fallbacks.js`** — measures parser scaling for nested var() fallbacks with increasing depths.
- **`benchmark-serialization.js`** — measures buffered serializer scaling for wide sums/products, nested calls, and nested opaque fallbacks.
- **`harvest-github.js`** — scrapes real-world `calc()` expressions from
  public GitHub into `test/corpus/github/expressions.txt`.
- **`split-corpus.js`** — splits that file into `github-pure.txt` (feeds
  `benchmark.js`/`show-divergences.js` below), `preprocessor.txt`, and
  `invalid.txt` (the latter two are used by real CI resilience tests).
- **`lib/corpus.js`** — shared loader for `github-pure.txt`.
- **`benchmark.js`** — times our pipeline against `@csstools/css-calc` over
  the pure corpus.
- **`show-divergences.js`** — buckets where our output disagrees with
  `@csstools/css-calc` over the pure corpus, for manual triage.
- **`randomizer.js`** — long-running fuzzer: generates `calc()` inputs at
  increasing depth, compares against `@csstools/css-calc`, logs finds to
  `reports/randomizer-finds.jsonl`.
