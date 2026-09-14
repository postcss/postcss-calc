import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareParserBenchmarks,
  exitCodeFor,
} from '../../scripts/compare-parser-benchmarks.js';

const arithmeticKeys = ['additive', 'multiplicative'].flatMap((kind) =>
  ['cold-index', 'hot-shared-index'].flatMap((mode) =>
    [1_000, 2_000, 4_000, 8_000].map((size) => `${kind}:${mode}:${size}`)
  )
);
const nestedKeys = ['cold-index', 'hot-shared-index'].flatMap((mode) =>
  [50, 100, 200, 400].map((depth) => `${mode}:${depth}`)
);

function makeResult(benchmark = 'arithmetic-chains', medianMs = 1) {
  const keys = benchmark === 'arithmetic-chains' ? arithmeticKeys : nestedKeys;
  return {
    schema: 1,
    benchmark,
    measurements: keys.map((key) => {
      const parts = key.split(':');
      if (benchmark === 'arithmetic-chains') {
        const [kind, mode, size] = parts;
        return { kind, mode, size: Number(size), medianMs };
      }
      const [mode, depth] = parts;
      return { mode, depth: Number(depth), medianMs };
    }),
  };
}

function runComparator(benchmark, edit = () => {}) {
  const directory = mkdtempSync(join(tmpdir(), 'postcss-calc-benchmark-'));
  try {
    const results = Array.from({ length: 6 }, () => makeResult(benchmark));
    edit(results);
    const paths = results.map((value, index) => {
      const path = join(directory, `run-${index}.json`);
      writeFileSync(path, `BENCHMARK_RESULT ${JSON.stringify(value)}\n`);
      return path;
    });
    return compareParserBenchmarks(paths);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('benchmark comparator rejects a run with a missing key', () => {
  assert.throws(
    () =>
      runComparator('arithmetic-chains', (runs) => {
        runs[3].measurements.pop();
      }),
    /missing measurement keys/
  );
});

test('schema-v2 correctness failures use the correctness exit code', () => {
  assert.equal(exitCodeFor('pass'), 0);
  assert.equal(exitCodeFor('regression'), 1);
  assert.equal(exitCodeFor('inconclusive'), 2);
  assert.equal(exitCodeFor('correctness-failure'), 3);
});

test('benchmark comparator rejects an empty measurement run', () => {
  assert.throws(
    () =>
      runComparator('arithmetic-chains', (runs) => {
        runs[0].measurements = [];
      }),
    /missing measurement keys/
  );
});

test('benchmark comparator rejects duplicate keys', () => {
  assert.throws(
    () =>
      runComparator('arithmetic-chains', (runs) => {
        runs[3].measurements.push(runs[3].measurements[0]);
      }),
    /duplicate measurement key/
  );
});

test('benchmark comparator rejects schema mismatches', () => {
  assert.throws(
    () =>
      runComparator('arithmetic-chains', (runs) => {
        runs[1].schema = 2;
      }),
    /same schema and benchmark/
  );
});

test('benchmark comparator rejects zero and negative timings', () => {
  for (const medianMs of [0, -1]) {
    assert.throws(
      () =>
        runComparator('arithmetic-chains', (runs) => {
          runs[0].measurements[0].medianMs = medianMs;
        }),
      /invalid medianMs.*finite and > 0/
    );
  }
});

test('benchmark comparator rejects non-finite computed ratios', () => {
  const comparison = runComparator('arithmetic-chains', (runs) => {
    for (const run of runs.slice(0, 3)) run.measurements[0].medianMs = 1e-308;
    for (const run of runs.slice(3)) run.measurements[0].medianMs = 1e308;
  });
  assert.ok(
    comparison.failures.includes('additive:cold-index:1000: non-finite ratio')
  );
  assert.equal(
    comparison.summaries.some(
      (summary) => summary.key === 'additive:cold-index:1000'
    ),
    false
  );
});

test('benchmark comparator rejects non-finite computed growth', () => {
  const comparison = runComparator('nested-fallbacks', (runs) => {
    for (const run of runs) {
      for (const measurement of run.measurements) {
        if (measurement.depth === 100) measurement.medianMs = 1e-308;
        if (measurement.depth === 200) measurement.medianMs = 1e308;
      }
    }
  });
  assert.deepEqual(comparison.failures, [
    'cold-index 100->200: non-finite growth',
    'hot-shared-index 100->200: non-finite growth',
  ]);
});

test('benchmark comparator reports largest-case regressions for every arithmetic kind and mode', () => {
  for (const key of arithmeticKeys.filter((candidate) =>
    candidate.endsWith(':8000')
  )) {
    const comparison = runComparator('arithmetic-chains', (runs) => {
      for (const run of runs.slice(3)) {
        const measurement = run.measurements.find(
          (candidate) =>
            `${candidate.kind}:${candidate.mode}:${candidate.size}` === key
        );
        measurement.medianMs = 2;
      }
    });
    assert.deepEqual(comparison.failures, [
      `${key}: 2.00x baseline (limit 1.10x)`,
    ]);
  }
});

test('benchmark comparator covers nested-fallbacks measurements and modes', () => {
  const comparison = runComparator('nested-fallbacks');
  assert.deepEqual(comparison.failures, []);
  assert.equal(comparison.summaries.length, nestedKeys.length);

  for (const key of nestedKeys.filter((candidate) =>
    candidate.endsWith(':400')
  )) {
    const regression = runComparator('nested-fallbacks', (runs) => {
      for (const run of runs.slice(3)) {
        const measurement = run.measurements.find(
          (candidate) => `${candidate.mode}:${candidate.depth}` === key
        );
        measurement.medianMs = 2;
      }
    });
    assert.deepEqual(regression.failures, [
      `${key}: 2.00x baseline (limit 1.10x)`,
    ]);
  }
});

test('benchmark comparator fails a 2.5x doubling-growth regression', () => {
  const comparison = runComparator('nested-fallbacks', (runs) => {
    for (const run of runs.slice(3)) {
      for (const measurement of run.measurements) {
        if (measurement.depth === 200) measurement.medianMs = 0.1;
        if (measurement.depth === 400) measurement.medianMs = 1;
      }
    }
  });
  assert.deepEqual(comparison.failures, [
    'cold-index 200->400: 10.00x growth (limit 2.50x)',
    'hot-shared-index 200->400: 10.00x growth (limit 2.50x)',
  ]);
});

test('benchmark comparator accepts complete matching arithmetic runs', () => {
  const comparison = runComparator('arithmetic-chains');
  assert.deepEqual(comparison.failures, []);
  assert.equal(comparison.summaries.length, arithmeticKeys.length);
});
