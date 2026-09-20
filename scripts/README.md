# Benchmark scripts

These scripts are deliberately outside the ordinary test suite. Run them on a
controlled machine with `node scripts/<name>.js` (or the corresponding pnpm
command). Benchmark artifacts are schema-v2 JSON files and retain raw
observations, configuration, provenance, and enough information for offline
reanalysis.

- **`benchmark-arithmetic-chains.js`** — runs the fresh-process, paired parser
  benchmark for arithmetic shapes. `benchmark-nested-fallbacks.js` does the
  same for nested `var()` fallbacks. Both accept `--baseline`, `--blocks`,
  `--max-attempts`, `--seed`, and `--output`, and write schema-v2 artifacts under
  `reports/benchmarks/`. The default arithmetic grid uses four logarithmically
  spaced sizes with uniform doubling steps (`2,000` to `16,000`) and a tuned
  batch schedule so a controlled run completes under 5 minutes while preserving
  the paired fresh-process blocks, balanced process order, stratified interval,
  doubling-growth gate, and family-adjusted precision gate; request more
  `--blocks` to trade time for power.
- Parser benchmark exit codes are `0` pass, `1` regression, `2` inconclusive,
  `3` benchmark/correctness/infrastructure failure, and `64` invalid usage or
  artifact. Twenty blocks are the minimum operational floor, not a guarantee
  of adequate precision or power. The artifact reports observed variance,
  interval width, and estimated blocks needed for the declared margin. A pass
  requires every gated runtime, slope, and growth endpoint to meet its
  predeclared precision target; the requested block count is never increased
  from an observed effect during a run.
- **`compare-parser-benchmarks.js`** — reanalyzes one schema-v2 parser
  artifact and applies the uncertainty-aware runtime, slope, and growth gates.
- **`benchmark-serialization.js`** — measures buffered serializer scaling for wide sums/products, nested calls, and nested opaque fallbacks.
- **`harvest-github.js`** — scrapes real-world `calc()` expressions from
  public GitHub into `test/corpus/github/expressions.txt`.
- **`split-corpus.js`** — splits that file into `github-pure.txt` (feeds
  `benchmark.js`/`show-divergences.js` below), `preprocessor.txt`, and
  `invalid.txt` (the latter two are used by real CI resilience tests).
- **`lib/corpus.js`** — shared loader for `github-pure.txt`.
- **`benchmark.js`** — (`pnpm benchmark:corpus`) validates and times our
  pipeline against `@csstools/css-calc` over the pure corpus in fresh
  processes. It is report-only for speed; correctness and infrastructure
  failures are nonzero.
- **`benchmark-plugin.js`** — measures PostCSS processing; awaiting
  `.process(...)` already includes result serialization, so the benchmark does
  not add a redundant `result.css` read.
- **`show-divergences.js`** — buckets where our output disagrees with
  `@csstools/css-calc` over the pure corpus, for manual triage.
- **`randomizer.js`** — long-running fuzzer: generates `calc()` inputs at
  increasing depth, compares against `@csstools/css-calc`, logs finds to
  `reports/randomizer-finds.jsonl`.

## Claims and decision protocol

| Benchmark         | Claim type            | Estimand / unit                                                                                                         | Decision                                                                                                                                                 |
| ----------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parser workloads  | regression-gating     | equal-weighted, order-stratified fresh-process blocks for each generated endpoint                                       | stratified studentized max-T interval; a regression or pass requires the simultaneous bound and family-adjusted precision target; otherwise inconclusive |
| Corpus reducer    | comparative-reporting | relative total runtime over the fixed set of unique harvested expressions accepted equivalently by both implementations | paired fresh-process replicates retain both order measurements; 95% superiority and separate 90% practical-margin intervals                              |
| Serializer script | local profiling       | repeated alternating calls to worktree and `HEAD` serializers in one process; outputs are compared before timing        | prints two medians per workload; no raw artifact or uncertainty interval                                                                                 |
| Adapter script    | local profiling       | repeated PostCSS processing by the current implementation in one process                                                | prints one median per workload; no baseline comparison, raw artifact, uncertainty interval, or correctness gate                                          |

Parser artifacts use an equal-weighted two-stratum estimator over
`baseline-first` and `candidate-first` blocks. Their intervals are a
stratified, studentized max-T bootstrap: each complete block is the
independent experimental unit, resampling is independent within process-order
strata, and the family critical value is transformed with each endpoint's
observed standard error. Parser regressions require both a simultaneous bound
beyond the runtime threshold and a family-adjusted interval no wider than the
configured precision target; insufficient precision yields `inconclusive`.
When a bootstrap resample has zero standard error but a nonzero deviation, its
studentized statistic uses that endpoint's observed standard error. The
artifact records how many resamples used this fallback.

The corpus benchmark runs each replicate in a fresh process. Each replicate
contains three observations in each execution order, and the bootstrap samples
complete replicate records so the two order measurements stay paired. The
corpus is unique-weighted, not frequency-weighted, and its results must not be
generalized to all real-world CSS. The serializer and adapter scripts are
profiling aids; their medians are not regression gates.

Corpus correctness is checked against the public `reduceCalc()` API used by
the timer. An untimed pass canonicalizes each public output and its accepted
canonical result to a common form, then records a checksum over the exact
public output content.

The corpus practical-equivalence margin is named in the artifact as
`equivalenceMargin: 1.1` (10%). A result is within the declared margin only
when its 90% interval lies wholly inside `[1 / 1.1, 1.1]`; this is not a claim
that the implementations are identical; the artifact labels this practical
field `equivalent` and retains the declared margin. The statistical verdict is separate:
`postcss-calc faster` requires a 95% upper bound below 1,
`postcss-calc slower` requires a 95% lower bound above 1, and every other case
is `inconclusive`.

`precisionMargin` is recorded separately from the runtime and growth decision
thresholds. Precision is met only when the actual family-adjusted interval's
half-width is within the configured log-scale target and the minimum block
count is present. The decision configuration records this as
`precisionMethod: family-adjusted-interval-width`; the normal approximation
parameter used by the earlier protocol is no longer part of new artifacts.
`requestedBlocks` records the sample count requested before observations were
collected.

Drift rejection and structural mismatch are separate. Structural mismatch is
an immediate correctness failure. Drift-rejected attempts remain in the
artifact; the primary analysis uses the predeclared accepted-block policy and
the sensitivity analysis uses all structurally valid attempts with the same
order-adjusted estimator. Both summaries are recorded, and disagreement makes
the result inconclusive. The drift threshold and order-interaction threshold
are named and recorded in the artifact rather than inferred during reanalysis.
Reanalysis executes no workload: raw observations plus the recorded decision
configuration are the sole source of truth.

## Controlled-run checklist

Before a long run, use an idle machine on AC power, a stable CPU governor, no
concurrent builds, and the same Node version for baseline and candidate. Record
warnings if the governor, load, or dirty worktree is unsuitable. Repeat the run
when control drift or rejection rates are high; the metadata records these
conditions but cannot fully control them.

Useful verification commands:

```sh
pnpm test:benchmark
pnpm test:benchmark:simulation
pnpm benchmark:reanalyze reports/benchmarks/<artifact>.json
```

The normal test command should keep schema checks, analyzer tests, simulation
smoke tests, and synthetic slowdown fixtures short. The fixed-seed smoke
calibration runs 200 experiments; setting
`POSTCSS_CALC_FULL_CALIBRATION=1` runs the thousands-of-experiments,
production-like calibration outside normal CI. Full corpus and long benchmark
runs remain explicit operations.

The fixed-seed simulation smoke test expects simultaneous 95% coverage between
0.90 and 0.99 over 200 experiments. This binomial tolerance is an operational
check, not a proof of coverage for every workload: endpoint correlation, skew,
temporal drift, order penalties, and outliers can differ in production. The
full calibration uses a tighter 0.925–0.975 range over 2,000 experiments and
should be rerun when changing the interval procedure.
