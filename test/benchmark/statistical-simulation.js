/* A small, fixed-seed calibration smoke test. Long-running calibration can
 * increase the replicate count without changing the ordinary test suite. */
import assert from 'node:assert/strict';
import {
  bootstrapStratifiedMaxT,
  seededRandom,
} from '../../scripts/lib/benchmark.js';
import { analyzeParser } from '../../scripts/lib/parser-benchmark.js';
import { syntheticParserArtifact } from '../helpers/benchmark-artifact.js';

const FULL = process.env.POSTCSS_CALC_FULL_CALIBRATION === '1';
const RUNS = FULL ? 2_000 : 200;
const ROWS = 30;
const RESAMPLES = FULL ? 10_000 : 1_000;
let covered = 0;

for (let run = 0; run < RUNS; run++) {
  const random = seededRandom(0x510e + run);
  const strata = Array.from({ length: ROWS }, (_, index) =>
    index % 2 ? 'candidate-first' : 'baseline-first'
  );
  const rows = Array.from({ length: ROWS }, () => {
    const common = (random() - 0.5) * 0.2;
    const low = common + (random() - 0.5) * 0.1;
    const high = common + (random() - 0.5) * 0.8;
    return [low, high];
  });
  const intervals = bootstrapStratifiedMaxT({
    rows,
    strata,
    seed: 0xabc000 + run,
    resamples: RESAMPLES,
  });
  assert.equal(intervals.method, 'stratified-max-t-studentized-bootstrap');
  assert.ok(
    intervals.intervals[0].familyUpper - intervals.intervals[0].familyLower <
      intervals.intervals[1].familyUpper - intervals.intervals[1].familyLower
  );
  if (
    intervals.intervals.every(
      (interval) => interval.familyLower <= 0 && interval.familyUpper >= 0
    )
  )
    covered++;
}

const coverage = covered / RUNS;
const minimumCoverage = FULL ? 0.925 : 0.9;
const maximumCoverage = FULL ? 0.975 : 0.99;
assert.ok(
  coverage >= minimumCoverage && coverage <= maximumCoverage,
  `simultaneous coverage was ${coverage}, expected ${minimumCoverage}..${maximumCoverage}`
);

const parserArtifact = syntheticParserArtifact({
  seed: 0x510e,
  rows: Array.from({ length: 20 }, (_, index) => ({
    baseline: [1],
    candidate: [1.01],
    processOrder: index % 2 ? 'candidate-first' : 'baseline-first',
  })),
  config: { bootstrapResamples: RESAMPLES },
});
const parserAnalysis = analyzeParser(parserArtifact);
assert.equal(parserAnalysis.endpoints.length, 1);
assert.equal(parserAnalysis.endpoints[0].bootstrap95.familyCount, 1);

function noise(random, scale) {
  return (
    (random() + random() + random() + random() + random() + random() - 3) *
    scale
  );
}

const scenarioTruth = {
  boundary: [Math.log(1.1), Math.log(1.1)],
  beyondMargin: [Math.log(1.15), 0],
  skewed: [0.01, 0.01],
  differingVariance: [0, 0],
  temporalDrift: [0, 0],
  orderPenalty: [0, 0],
  outlier: [0, 0],
};

function scenarioRows(name, run) {
  const random = seededRandom(0x7200 + run * 17 + name.length);
  const effects = scenarioTruth[name];
  return Array.from({ length: ROWS }, (_, index) => {
    const processOrder = index % 2 ? 'candidate-first' : 'baseline-first';
    const common = noise(random, name === 'differingVariance' ? 0.02 : 0.08);
    const drift = name === 'temporalDrift' ? (index - ROWS / 2) * 0.004 : 0;
    let penalty = 0;
    if (name === 'orderPenalty')
      penalty = processOrder === 'candidate-first' ? 0.18 : -0.18;
    const skew = name === 'skewed' ? (random() ** 2 - 1 / 3) * 0.3 : 0;
    const outlier = name === 'outlier' && index === 3 ? 0.8 : 0;
    const baseline = [1, 1].map((value) => value * Math.exp(common + drift));
    const candidate = effects.map((effect, endpoint) => {
      const endpointNoise =
        name === 'differingVariance' && endpoint === 1
          ? noise(random, 0.35)
          : noise(random, 0.08);
      return (
        baseline[endpoint] *
        Math.exp(effect + endpointNoise + penalty + skew + outlier)
      );
    });
    return { baseline, candidate, processOrder };
  });
}

function classify(intervals) {
  const threshold = Math.log(1.1);
  if (intervals.some((item) => item.familyLower > threshold))
    return 'regression';
  if (intervals.every((item) => item.familyUpper <= threshold)) return 'pass';
  return 'inconclusive';
}

const scenarioNames = [
  'boundary',
  'beyondMargin',
  'skewed',
  'differingVariance',
  'temporalDrift',
  'orderPenalty',
  'outlier',
];
const scenarioRuns = FULL ? 500 : 100;
const scenarioResamples = FULL ? 5_000 : 500;
const scenarioResults = Object.fromEntries(
  scenarioNames.map((name) => {
    const counts = { pass: 0, regression: 0, inconclusive: 0 };
    let scenarioCovered = 0;
    for (let run = 0; run < scenarioRuns; run++) {
      const rows = scenarioRows(name, run);
      const intervals = bootstrapStratifiedMaxT({
        rows: rows.map(({ baseline, candidate }) =>
          candidate.map((value, endpoint) =>
            Math.log(value / baseline[endpoint])
          )
        ),
        strata: rows.map((row) => row.processOrder),
        seed: 0x910000 + run,
        resamples: scenarioResamples,
      }).intervals;
      counts[classify(intervals)]++;
      if (
        intervals.every(
          (interval, endpoint) =>
            interval.familyLower <= scenarioTruth[name][endpoint] &&
            interval.familyUpper >= scenarioTruth[name][endpoint]
        )
      )
        scenarioCovered++;
    }
    return [
      name,
      {
        runs: scenarioRuns,
        falseRegressionRate:
          name === 'beyondMargin' ? null : counts.regression / scenarioRuns,
        falsePassRate:
          name === 'beyondMargin' ? counts.pass / scenarioRuns : null,
        inconclusiveRate: counts.inconclusive / scenarioRuns,
        simultaneousCoverage: scenarioCovered / scenarioRuns,
      },
    ];
  })
);
console.log(
  JSON.stringify({
    seed: 0x510e,
    runs: RUNS,
    rows: ROWS,
    resamples: RESAMPLES,
    simultaneousCoverage: coverage,
    expectedCoverageRange: FULL ? [0.925, 0.975] : [0.9, 0.99],
    mode: FULL ? 'full' : 'smoke',
    scenarios: scenarioResults,
  })
);
