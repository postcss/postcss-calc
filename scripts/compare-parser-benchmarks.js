// Compare three baseline and three candidate parser benchmark transcripts.
// Each transcript must contain the BENCHMARK_RESULT line emitted by one of
// benchmark-arithmetic-chains.js or benchmark-nested-fallbacks.js.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const usage =
  'Usage: node scripts/compare-parser-benchmarks.js ' +
  '<baseline-1> <baseline-2> <baseline-3> ' +
  '<candidate-1> <candidate-2> <candidate-3>';

/** @param {string} path @return {object} */
function readResult(path) {
  const line = readFileSync(path, 'utf8')
    .split('\n')
    .findLast((candidate) => candidate.startsWith('BENCHMARK_RESULT '));
  if (!line) throw new Error(`${path}: missing BENCHMARK_RESULT line`);
  return JSON.parse(line.slice('BENCHMARK_RESULT '.length));
}

/** @param {number[]} values @return {number} */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * @param {string[]} files
 * @return {{benchmark: string, summaries: object[], failures: string[]}}
 */
function compareParserBenchmarks(files) {
  if (files.length !== 6) throw new Error(usage);

  const results = files.map(readResult);
  const benchmark = results[0].benchmark;
  if (
    results.some(
      (result) => result.schema !== 1 || result.benchmark !== benchmark
    )
  ) {
    throw new Error(
      'all benchmark transcripts must have the same schema and benchmark'
    );
  }

  const baseline = results.slice(0, 3);
  const candidate = results.slice(3);
  const keyOf = (measurement) =>
    benchmark === 'arithmetic-chains'
      ? `${measurement.kind}:${measurement.mode}:${measurement.size}`
      : `${measurement.mode}:${measurement.depth}`;

  let expectedKeys;
  if (benchmark === 'arithmetic-chains') {
    expectedKeys = ['additive', 'multiplicative'].flatMap((kind) =>
      ['cold-index', 'hot-shared-index'].flatMap((mode) =>
        [1_000, 2_000, 4_000, 8_000].map((size) => `${kind}:${mode}:${size}`)
      )
    );
  } else if (benchmark === 'nested-fallbacks') {
    expectedKeys = ['cold-index', 'hot-shared-index'].flatMap((mode) =>
      [50, 100, 200, 400].map((depth) => `${mode}:${depth}`)
    );
  } else {
    throw new Error(`unsupported benchmark: ${benchmark}`);
  }

  /** @param {object} result @param {string} path */
  function validateMeasurements(result, path) {
    if (!Array.isArray(result.measurements)) {
      throw new TypeError(`${path}: measurements must be an array`);
    }

    const expected = new Set(expectedKeys);
    const seen = new Set();
    for (const measurement of result.measurements) {
      if (measurement === null || typeof measurement !== 'object') {
        throw new TypeError(`${path}: invalid measurement`);
      }
      const key = keyOf(measurement);
      if (!expected.has(key)) {
        throw new Error(`${path}: unexpected measurement key ${key}`);
      }
      if (seen.has(key)) {
        throw new Error(`${path}: duplicate measurement key ${key}`);
      }
      if (
        typeof measurement.medianMs !== 'number' ||
        !Number.isFinite(measurement.medianMs) ||
        measurement.medianMs <= 0
      ) {
        throw new TypeError(
          `${path}: invalid medianMs for ${key} (must be finite and > 0)`
        );
      }
      seen.add(key);
    }

    const missing = expectedKeys.filter((key) => !seen.has(key));
    if (missing.length > 0) {
      throw new Error(
        `${path}: missing measurement keys ${missing.join(', ')}`
      );
    }
  }

  // Validate every transcript before aggregating any measurements. This keeps
  // missing, duplicate, and empty runs from silently disappearing in a Map.
  for (let i = 0; i < results.length; i++) {
    validateMeasurements(results[i], files[i]);
  }

  /** @param {object[]} runs @return {Map<string, number[]>} */
  function valuesByKey(runs) {
    /** @type {Map<string, number[]>} */
    const values = new Map();
    for (const run of runs) {
      for (const measurement of run.measurements) {
        const key = keyOf(measurement);
        const samples = values.get(key) ?? [];
        samples.push(measurement.medianMs);
        values.set(key, samples);
      }
    }
    return values;
  }

  const baseValues = valuesByKey(baseline);
  const candidateValues = valuesByKey(candidate);
  const failures = [];
  const summaries = [];

  for (const [key, values] of candidateValues) {
    const baselineSamples = baseValues.get(key);
    if (
      !baselineSamples ||
      baselineSamples.length !== 3 ||
      values.length !== 3
    ) {
      failures.push(`${key}: expected three baseline and candidate samples`);
      continue;
    }
    const baseMedian = median(baselineSamples);
    const candidateMedian = median(values);
    const ratio = candidateMedian / baseMedian;
    if (!Number.isFinite(ratio)) {
      failures.push(`${key}: non-finite ratio`);
      continue;
    }
    summaries.push({ key, baseMedian, candidateMedian, ratio });

    const parts = key.split(':');
    const size = Number(parts.at(-1));
    const largest =
      benchmark === 'arithmetic-chains' ? size === 8_000 : size === 400;
    if (largest && ratio > 1.1) {
      failures.push(`${key}: ${ratio.toFixed(2)}x baseline (limit 1.10x)`);
    }
  }

  // Recompute growth from the three-run medians rather than trusting a single
  // run's printed ratios. This makes the doubling gate auditable and resistant
  // to a transient sample in one invocation.
  const grouped = new Map();
  for (const summary of summaries) {
    const parts = summary.key.split(':');
    const mode = benchmark === 'arithmetic-chains' ? parts[1] : parts[0];
    const family = benchmark === 'arithmetic-chains' ? parts[0] : '';
    const size = Number(parts.at(-1));
    const groupKey =
      benchmark === 'arithmetic-chains' ? `${family}:${mode}` : mode;
    const group = grouped.get(groupKey) ?? [];
    group.push({ size, median: summary.candidateMedian });
    grouped.set(groupKey, group);
  }
  for (const [groupKey, points] of grouped) {
    points.sort((a, b) => a.size - b.size);
    for (let i = 1; i < points.length; i++) {
      const growth = points[i].median / points[i - 1].median;
      if (!Number.isFinite(growth)) {
        failures.push(
          `${groupKey} ${points[i - 1].size}->${points[i].size}: non-finite growth`
        );
        continue;
      }
      if (growth > 2.5) {
        failures.push(
          `${groupKey} ${points[i - 1].size}->${points[i].size}: ${growth.toFixed(2)}x growth (limit 2.50x)`
        );
      }
    }
  }

  return { benchmark, summaries, failures };
}

function printComparison(comparison) {
  for (const summary of comparison.summaries) {
    console.log(
      `${summary.key.padEnd(38)} ${summary.baseMedian.toFixed(3).padStart(8)} ms -> ` +
        `${summary.candidateMedian.toFixed(3).padStart(8)} ms ` +
        `(${summary.ratio.toFixed(2)}x)`
    );
  }
  if (comparison.failures.length > 0) {
    console.error('\nBenchmark gates failed:');
    for (const failure of comparison.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(
      '\nBenchmark gates passed: largest medians <= 1.10x and every doubling <= 2.50x.'
    );
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = process.argv.slice(2);
  if (files.length !== 6) {
    console.error(usage);
    process.exitCode = 2;
  } else {
    try {
      printComparison(compareParserBenchmarks(files));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}

export { compareParserBenchmarks };
