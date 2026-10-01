# Benchmarking Architecture and Methodology

This document explains the statistical foundations, experiment design, and
software architecture behind the `postcss-calc` benchmark suite.

Contributors modifying hot parsing, analysis, simplification, or serialization
paths should understand these principles to interpret benchmark results, design
new benchmarks, and avoid introducing performance regressions.

## 0. Read This First: What the Numbers Do and Do Not Mean

- **A benchmark result is an estimate for one machine, one Node.js version, and
  one synthetic workload set.** It is not a property of the code. Do not quote
  a ratio such as "1.2x faster" without the interval, the workload, and the
  environment.
- **The parser benchmarks time only `parse()`** on already-tokenized input
  (`scripts/benchmark/parser-benchmark-worker.js`). Tokenization, analysis,
  simplification, serialization, and PostCSS overhead are not measured. A
  parser win can be invisible, or offset, in end-to-end use.
- **The parser workloads are synthetic stress shapes** (long operator chains,
  deep `var()` fallbacks), chosen to expose complexity regressions. They are not
  representative of typical stylesheets; `pnpm benchmark:corpus` is the
  closest proxy to real input.
- **`pass` means "no regression detected at the declared margin and
  precision"**, not "identical performance". `inconclusive` means the data
  could not decide, not that nothing changed. Absence of evidence is not
  evidence of absence.
- **Statistical guarantees are approximate.** The bootstrap procedures are
  asymptotic, and a default run has only 20 blocks. Treat nominal coverage
  (such as "95%") as a design target, which `pnpm test:benchmark:simulation`
  checks against simulated noise, not as a promise about your machine.
- **A benchmark is a measurement, not a requirement.** Correctness,
  readability, and the project's other priorities outweigh a small measured
  difference inside the declared 10% margin.

---

## 1. Why Benchmarking CSS Math is Hard

Microbenchmarks for JavaScript compilers and parsers face several severe
sources of bias and noise:

1. **JIT Compilation and Inline Cache (IC) Polymorphism**:
   The V8 engine optimizes functions via TurboFan based on runtime type feedback
   and call frequency. If baseline and candidate implementations run in the same
   process, the second implementation runs in an engine already warmed by the
   first, or suffers deoptimizations from polymorphic hidden classes. (Georges et
   al. 2007 and Mytkowicz et al. 2009 show how large such effects can be.)
2. **Memory and Garbage Collection Contamination**:
   Major GC cycles and heap fragmentation from previous runs artificially penalize
   subsequent runs.
3. **Hardware and Environmental Drift**:
   CPU frequency scaling, Intel Turbo Boost, AMD Precision Boost, thermal
   throttling, and OS scheduling jitter can shift machine throughput by amounts
   comparable to the effects being measured (often several percent or more) over
   minute-long benchmark runs.
4. **Multiple Comparisons Problem**:
   Testing dozens of workloads across various shapes and sizes increases the
   probability of false-positive regressions or false-positive speedups by chance
   alone.
5. **Algorithmic Complexity Degradation**:
   A change might appear faster on small inputs due to lower constant overhead,
   yet degrade asymptotic complexity from $O(N)$ to $O(N^2)$, causing catastrophic
   blowups on large inputs.

To mitigate these challenges, `postcss-calc` uses an uncertainty-aware
benchmarking system. It reduces these biases; it does not eliminate them.

---

## 2. Statistical Foundations

### Log-Ratio Estimand and Scale Transformation

All paired comparisons are evaluated on the log-ratio scale:

$$\ln\left(\frac{T_{\text{candidate}}}{T_{\text{baseline}}}\right) = \ln(T_{\text{candidate}}) - \ln(T_{\text{baseline}})$$

- **Symmetry**: On a linear scale, a $2\times$ slowdown is $+100\%$ ($+1.0$), while
  a $2\times$ speedup is $-50\%$ ($-0.5$). On the log scale, a $2\times$ slowdown is
  $+\ln 2 \approx +0.693$ and a $2\times$ speedup is $-\ln 2 \approx -0.693$, treating
  improvements and regressions symmetrically.
- **Variance Stabilization**: Raw runtime differences ($\Delta \text{ms}$) scale with
  input size (e.g., 2,000 vs. 16,000 nodes). The log transformation linearizes
  multiplicative noise and stabilizes variance across orders of magnitude.
- **Geometric Mean**: Exponentiating the mean log ratio produces the **geometric
  mean ratio**. Fleming & Wallace (1986) show that the geometric mean is the
  appropriate way to average normalized ratios, because the arithmetic mean of
  ratios depends on which implementation is chosen as the reference. It
  summarizes relative change; it says nothing about absolute time.

### Stratified Studentized Max-T Bootstrap

Parser benchmarks use an equal-weighted two-stratum estimator over `baseline-first`
and `candidate-first` blocks (a _block_ is one baseline process plus one
candidate process, run back to back):

$$\hat{\theta} = \frac{1}{2}\left(\bar{Y}_{\text{baseline-first}} + \bar{Y}_{\text{candidate-first}}\right)$$

The confidence intervals are derived via a **stratified, studentized max-T
bootstrap** (`bootstrapStratifiedMaxT` in `scripts/benchmark/bootstrap.js`):

1. **Cluster Resampling**: Each complete block is the independent experimental
   unit. Resampling selects entire rows, preserving the full empirical covariance
   and correlation structure across all runtime endpoints, slopes, and growth
   metrics (24 runtime endpoints for `arithmetic-chains`, 12 for
   `nested-fallbacks`).
2. **Independent Stratum Sampling**: Resampling occurs independently within each
   process-order stratum to maintain balance.
3. **Family-Wise Error Rate (FWER) Control**: For each bootstrap replicate $b$, the
   maximum studentized deviation across all $P$ claims is calculated:

   $$T_{\max}^{*(b)} = \max_{j=1,\dots,P} \frac{|\hat{\theta}_j^{*(b)} - \hat{\theta}_j|}{\widehat{SE}_j^{*(b)}}$$

   The $(1 - \alpha)$ percentile of $T_{\max}^*$ defines a single family critical
   value $c_{1-\alpha}$. Simultaneous confidence intervals are formed as:

   $$[\hat{\theta}_j - c_{1-\alpha} \cdot \widehat{SE}_j,\; \hat{\theta}_j + c_{1-\alpha} \cdot \widehat{SE}_j]$$

   This is designed so that, with approximately 95% confidence, **all**
   simultaneous intervals cover their true values together. That controls the
   family-wise error rate; it does not eliminate false alarms. It avoids the full
   conservatism of a Bonferroni bound by using the observed correlation between
   endpoints. Coverage is approximate and can fall below nominal with few blocks.

4. **Why Studentize**: Studentized (bootstrap-t) intervals generally have better
   coverage accuracy than plain percentile intervals because the pivot depends
   less on the unknown variance (Hall, 1992; Davison & Hinkley, 1997). The
   improvement is asymptotic; 20 blocks is a small sample, so do not read it as
   a finite-sample guarantee.
5. **Degenerate Sample Handling**: When a resample contains identical observations
   such that $\widehat{SE}^* = 0$, the statistic safely falls back to using the
   observed sample standard error, tracking fallback occurrences without producing
   `NaN` or throwing unhandled errors.
6. **Resamples and Seeds**: Each analysis uses 100,000 bootstrap resamples from
   a seeded generator, so reanalysis of the same artifact is deterministic.
   The seed makes the arithmetic reproducible; it does not make the
   measurement reproducible.

Gate decisions combine two intervals per endpoint. A **regression** is declared
when the simultaneous (family-adjusted) 95% lower bound exceeds the margin. A
**pass** requires the one-sided 95% upper bound to be at or below the margin at
every gated endpoint. Anything in between is `inconclusive`. Runtime is gated on
the largest size of each shape and mode, together with the slope and growth
claims below.

### Two One-Sided Tests (TOST) vs. Superiority

The corpus benchmark evaluates the whole `postcss-calc` reduction pipeline
against `@csstools/css-calc` on harvested real-world expressions (only those
both implementations accept with equivalent output) and reports two separate
verdicts. It is a report-only comparison, not a regression gate. Unlike the
parser benchmark, each replicate runs both implementations in the same child
process in randomized order, so the JIT-sharing caveat from Section 1 applies:

1. **Statistical Superiority (95% Confidence)**:
   - Faster: 95% upper bound $< 1.0$.
   - Slower: 95% lower bound $> 1.0$.
   - Inconclusive: 95% CI covers $1.0$.
2. **Practical Equivalence (90% TOST Confidence)**:
   - Uses the Two One-Sided Tests (TOST) procedure (Schuirmann, 1987) with an
     equivalence margin of $\Delta = 1.1$ (10%). The margin is a project choice,
     not a statistical result; "equivalent" means "within 10%", not "identical".
   - If the 90% confidence interval falls entirely within $[1/\Delta, \Delta] =
     [1/1.1, 1.1] \approx [0.909, 1.100]$, the performance is classified as
     `equivalent`.
   - _Why 90%?_ Two simultaneous one-sided tests at $\alpha = 0.05$ mathematically
     correspond to a $(1 - 2\alpha) = 90\%$ two-sided confidence interval.

### Algorithmic Complexity and Scaling Gates

To detect asymptotic regressions before they impact production:

1. **Log-Log Slope Regression**:
   `arithmetic-chains` runs sizes $N \in \{2000, 4000, 8000, 16000\}$ and
   `nested-fallbacks` runs depths $\{16, 32, \dots, 512\}$. Regressing $\ln(T)$ on
   $\ln(N)$ yields the empirical scaling exponent $\beta$ ($T \propto N^\beta$)
   over that range.
   - Linear algorithms have $\beta \approx 1.0$; quadratic algorithms have $\beta \approx 2.0$.
     Cache, GC, and fixed-cost effects move $\beta$ over a narrow size range, so
     $\beta$ compares baseline and candidate; it does not prove asymptotic
     complexity.
   - The slope increase $\Delta\beta = \beta_{\text{cand}} - \beta_{\text{base}}$ is
     tested against $\log_2(\text{runtimeMargin}) = \log_2(1.1) \approx 0.1375$,
     directly tying allowable slope degradation to the runtime margin across a
     doubling step.
2. **Doubling Growth Gating**:
   The empirical growth factor per doubling $(T_{2N} / T_N)$ is calculated. If the
   lower 95% confidence bound exceeds `GROWTH_THRESHOLD = 2.5`, it is flagged as an
   algorithmic regression. (A perfectly linear algorithm grows 2x per doubling; 2.5
   leaves headroom for noise and cache effects, so it catches clearly super-linear
   behavior, not subtle drift.)

### Uncertainty-Aware Precision Floor

A benchmark cannot pass solely because variance was high and the confidence interval
was too wide to detect a difference. A verdict requires:

1. Observed blocks $\ge \text{MIN\_VALID\_BLOCKS}$ (20 blocks).
2. Interval half-width $\le \ln(\text{precisionMargin})$.

If noisy data prevents meeting the precision target, the result is marked
`inconclusive` rather than `pass`.

---

## 3. Experiment Design

### Fresh-Process Execution

Every parser-benchmark replicate spawns one fresh Node.js process per revision
using `child_process.spawnSync`.

- The child process loads only the specified revision (`baseline` or `candidate`).
  The baseline is the `src/` tree of a git revision (default `HEAD`, set with
  `--baseline`) extracted with `git archive`; the candidate is the current
  working tree, including uncommitted changes.
- No module cache, JIT compilation profile, or memory allocation carries over
  between revisions.
- Inside a child, all workloads run one after another in a shuffled order, so
  workloads can still influence each other through the shared heap and JIT
  state. The shuffle differs per block, so such effects average out instead of
  always favoring one workload.
- The corpus benchmark differs: each replicate's child runs both
  implementations (see Section 2).
- Communication with the parent harness occurs via structured JSON on stdin/stdout.

### Counterbalanced Scheduling and Order Effects

Even with fresh processes, temporal confounding (e.g., progressive thermal heating)
can systematically bias the revision that executes first.

- **Counterbalancing**: Every run generates an equal number of `baseline-first` and
  `candidate-first` blocks.
- **Randomized Schedule**: Blocks are ordered according to a deterministic shuffled
  schedule.
- **Order Interaction Diagnostic**: For each endpoint, the difference between the
  mean log ratios of `baseline-first` and `candidate-first` blocks is computed.
  If any endpoint's point estimate satisfies $|\Delta_{\text{order}}| >
  \ln(1.1)$, the run is declared `inconclusive`. This is a threshold on the
  estimate, not a hypothesis test; the artifact also stores an ordinary 95%
  interval for inspection.

### Environmental Drift Detection and Balanced Retries

Modern operating systems and CPUs dynamically modulate clock frequencies.

1. **Control Workloads**: A constant reference workload (a 5,000-term sum) is
   timed immediately before
   (`controlBefore`) and immediately after (`controlAfter`) the actual workloads in
   every child process.
2. **Drift Rejection**: If drift $|\frac{T_{\text{after}}}{T_{\text{before}}} - 1| >
   0.15$ (15%) in either child, the attempt is rejected. The control only detects
   drift visible across the whole child run, not short spikes in the middle. The
   rule depends on the control, not on the measured ratio, so it does not select
   for a favorable outcome.
3. **Slot-Preserving Retries**: When an attempt is rejected due to drift, the harness
   **retries the exact same schedule slot** (retaining the intended process order).
   This prevents differential drift rates from skewing the balance between
   `baseline-first` and `candidate-first` blocks.
4. **Predeclared Sensitivity Analysis**: Drift-rejected attempts are retained in the
   artifact. The harness runs a parallel sensitivity analysis using all structurally
   valid attempts. If the primary and sensitivity analyses disagree on the verdict,
   the outcome is forced to `inconclusive`. The harness makes at most
   `max(30, blocks)` attempts, so a very noisy machine ends with fewer than 20
   valid blocks and an `inconclusive` result instead of looping forever.

### Adaptive Batching and Warmup Stabilization

- **Timer Quantization**: Timer resolution and call overhead are mitigated by
  adaptive batching. The calibration step doubles repetitions until a batch lasts
  at least $0.6 \times \text{TARGET\_MS}$ (the parser benchmarks target 16ms; the
  corpus benchmark defaults to 25ms). Each measurement is the per-call mean of a
  batch, so it includes any GC pauses in that batch.
- **Warmup Stability**: Warmups repeat (4 to 8 batches for parser workloads) until
  the relative span of the last three warmup batches is $\le 10\%$. This is a
  heuristic for a stable timing level, not a guarantee that TurboFan has finished
  optimizing or that no later deoptimization will occur.

### Correctness Gating and Dead-Code Elimination Safeguards

- **Structural AST Verification**: Every parse result is hashed into a canonical
  digest (`digest(run())`). Baseline and candidate AST digests are compared for every
  workload. Any mismatch aborts execution immediately with a `correctness-failure`
  (exit code 3). A faster result with different output is a bug, not a win.
- **Dead-Code Elimination (DCE) Mitigation**: In optimizing JITs, expressions whose
  results are discarded can be optimized away. Each timed batch keeps its last
  result and walks it with `consume(value)` after the timer stops, so the final
  parse is observably used without putting the traversal inside the timed loop.
  This is a mitigation, not proof: earlier iterations in a batch are not
  consumed. Large workloads make complete elimination unlikely, but keep it in
  mind when adding very small benchmarks.

---

## 4. Software Engineering and Architecture

```text
               +--------------------------------------------------+
               |              Benchmark Orchestrator              |
               |        (scripts/benchmark/benchmark-*.js)        |
               +--------------------------------------------------+
                                        |
                   +--------------------+--------------------+
                   |                                         |
                   v                                         v
     +---------------------------+             +---------------------------+
     |   Child Worker Process    |             |   Child Worker Process    |
     |        (Baseline)         |             |        (Candidate)        |
     | - Fresh V8 environment    |             | - Fresh V8 environment    |
     | - Pre/post drift control  |             | - Pre/post drift control  |
     | - AST structural digest   |             | - AST structural digest   |
     | - Adaptive batch timing   |             | - Adaptive batch timing   |
     +---------------------------+             +---------------------------+
                   |                                         |
                   +--------------------+--------------------+
                                        v
                       +---------------------------------+
                       |     Raw Observations Stream     |
                       +---------------------------------+
                                        |
                   +--------------------+--------------------+
                   |                                         |
                   v                                         v
     +---------------------------+             +---------------------------+
     |   Schema-v2 JSON Report   |             |    Statistical Engine     |
     | - Complete raw data       |             | - Stratified max-T        |
     | - Environmental metadata  |             | - Paired log-ratios       |
     | - Git & harness hashes    |<------------| - Slope & growth analysis |
     | - Forensic provenance     |             | - TOST & FWER decisions   |
     +---------------------------+             +---------------------------+
                   |
                   v
     +---------------------------+
     |    Offline Reanalyzer     |
          | (compare-parser-          |
     |  benchmarks.js)           |
     | - Zero workload execution |
     | - Consistency checks      |
     | - Deterministic audit     |
     +---------------------------+
```

### No Benchmarking Framework

The harness, statistics, bootstrap, and provenance code in `scripts/benchmark/`
use only Node.js built-in modules (`node:fs`, `node:crypto`,
`node:child_process`, `node:os`, `node:path`, `node:url`) and no third-party
benchmarking framework. The workers still import the project's own `src/` and
its dev dependencies (`@csstools/css-tokenizer`; `@csstools/css-calc` and
`postcss` for the corpus and plugin benchmarks), so installed dependencies
must match `pnpm-lock.yaml` for comparable runs.

### Schema-v2 Artifact Contract and Forensic Provenance

Benchmark outputs are stored as schema-v2 JSON artifacts under
`reports/benchmarks/`. Every artifact contains:

- Exact decision parameters (`decisionConfigVersion: 3`, margins, confidence
  levels, thresholds).
- Full forensic provenance: git commit SHAs, source tree SHA256 hashes, dependency
  lockfile hash, harness script hashes, worktree dirty status, CPU model, CPU core
  count, system load average, Node/V8 versions, and Linux CPU scaling governor.
- Complete raw observations: batch timings, calibration samples, warmup records,
  drift measurements, and structural checksums for every attempt.

### Offline Reanalysis and Consistency Checks

`scripts/benchmark/compare-parser-benchmarks.js` reanalyzes existing schema-v2 artifacts
without re-running any workload. When auditing an artifact, the analyzer re-derives all
statistics and compares them against stored summaries down to $10^{-10}$ relative
tolerance. Any discrepancy causes an immediate validation failure. This detects accidental
corruption and hand edits; it is not cryptographic tamper-proofing, because
consistently edited raw data still produces a valid file.

### Exit Code Standards

The parser runner and the reanalyzer use these exit codes. The corpus benchmark
is report-only: it exits `0` after a successful run whatever the verdict (read
the printed verdict), `64` for invalid usage, and `3` for correctness or
infrastructure failures.

| Exit Code | Meaning                                                                          |
| :-------- | :------------------------------------------------------------------------------- |
| `0`       | Pass (no regression detected, precision target met) / Superior                   |
| `1`       | Regression (lower confidence bound exceeds permitted threshold)                  |
| `2`       | Inconclusive (insufficient precision, order effect, or sensitivity disagreement) |
| `3`       | Correctness failure, structural mismatch, or harness runtime error               |
| `64`      | Invalid usage or malformed artifact                                              |

---

## 5. Guide for Contributors

### Available Benchmark Suites

| Command                                      | Workload                                                                   | Primary Purpose                                              |
| :------------------------------------------- | :------------------------------------------------------------------------- | :----------------------------------------------------------- |
| `pnpm benchmark:arithmetic-chains`           | Additive, multiplicative, and alternating precedence chains (sizes 2k–16k) | Regression-gating for core parser and block indexing         |
| `pnpm benchmark:nested-fallbacks`            | Deeply nested `var()` fallbacks (depths 16–512)                            | Regression-gating for recursion and opaque call handling     |
| `pnpm benchmark:corpus`                      | Real-world expressions harvested from GitHub vs. `@csstools/css-calc`      | Comparative reporting (not a gate) and practical equivalence |
| `pnpm benchmark:serialization`               | Wide sums, products, and nested calls across serializers                   | In-process local profiling for serializer changes            |
| `pnpm test:benchmark`                        | Unit tests for statistics, bootstrap, and schema validation                | Verifying benchmark harness logic                            |
| `pnpm test:benchmark:simulation`             | Monte Carlo calibration across adversarial noise scenarios                 | Verifying bootstrap empirical coverage                       |
| `node scripts/benchmark/benchmark-plugin.js` | PostCSS processing of generated stylesheets (no package script)            | In-process local profiling of the adapter                    |

`benchmark:serialization` and `benchmark-plugin.js` run in a single process and
print medians only. They give no uncertainty interval and no baseline
comparison, so treat their output as a profiling hint, never as evidence that a
change is faster. Confirm with the paired benchmarks above.

### Reading a Result

1. Look at the status (`pass`, `regression`, `inconclusive`), then at the
   intervals, not only the point estimate. An interval of $[0.97, 1.30]$ is
   compatible with both no change and a 30% regression.
2. Check `rejections` and `orderEffect` in the artifact. Frequent drift
   rejections or a large order effect mean the machine was unsuitable.
3. For `inconclusive`, rerun on a quieter machine or with more `--blocks` (an
   even number, at least 20). Do not rerun until you get the verdict you want:
   choose the block count before looking at the outcome.
4. A `pass` on synthetic parser workloads does not demonstrate an end-to-end
   speedup, or the absence of regressions on other inputs.

### Controlled Run Checklist

To minimize drift rejections and achieve adequate statistical power:

1. **System Power**: Run on AC power, never on battery.
2. **CPU Governor (Linux)**: Set the scaling governor to `performance`:
   ```sh
   echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
   ```
   The artifact records only the governor of `cpu0`. Disabling turbo/boost and
   pinning the run to fixed cores (for example with `taskset`) can reduce noise
   further, but is optional.
3. **Machine State**: Ensure the system is idle. Close browsers, background
   compilations, and IDE indexing tasks.
4. **Known Baseline**: The baseline is `HEAD` unless `--baseline <ref>` is
   given, and the candidate is the working tree. Commit or stash unrelated
   changes so the only difference is the change under test; the artifact records
   the dirty status. Dependencies must match `pnpm-lock.yaml`.
5. **Reanalysis**: To re-check an artifact without re-running the benchmark:
   ```sh
   pnpm benchmark:reanalyze reports/benchmarks/<artifact>.json
   ```

Artifacts are written to `reports/benchmarks/` and are git-ignored.

### References

- Fleming, P. J. & Wallace, J. J. (1986). How not to lie with statistics: the
  correct way to summarize benchmark results. _Communications of the ACM_ 29(3).
- Georges, A., Buytaert, D. & Eeckhout, L. (2007). Statistically rigorous Java
  performance evaluation. _OOPSLA_.
- Mytkowicz, T., Diwan, A., Hauswirth, M. & Sweeney, P. F. (2009). Producing
  wrong data without doing anything obviously wrong! _ASPLOS_.
- Kalibera, T. & Jones, R. (2013). Rigorous benchmarking in reasonable time.
  _ISMM_.
- Schuirmann, D. J. (1987). A comparison of the two one-sided tests procedure and
  the power approach for assessing the equivalence of average bioavailability.
  _Journal of Pharmacokinetics and Biopharmaceutics_ 15.
- Hall, P. (1992). _The Bootstrap and Edgeworth Expansion_. Springer.
- Davison, A. C. & Hinkley, D. V. (1997). _Bootstrap Methods and their
  Application_. Cambridge University Press.
