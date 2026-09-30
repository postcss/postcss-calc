import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  balancedOrder,
  balancedSchedule,
  bootstrapStratifiedMaxT,
  bootstrapPairedIntervals,
  bootstrapIndices,
  bootstrapRatioInterval,
  linearRegression,
  logRatio,
  median,
  variationMetrics,
} from '../../scripts/benchmark/benchmark.js';

test('benchmark schedules and bootstrap samples are deterministic', () => {
  assert.deepEqual(balancedOrder(10, 42), balancedOrder(10, 42));
  assert.equal(
    balancedOrder(10, 42).filter((value) => value === 'baseline-first').length,
    5
  );
  const oddSchedule = balancedSchedule(5, 'ours-first', 'reference-first', 42);
  assert.equal(
    Math.abs(
      oddSchedule.filter((value) => value === 'ours-first').length -
        oddSchedule.filter((value) => value === 'reference-first').length
    ),
    1
  );
  assert.deepEqual(bootstrapIndices(5, 7), bootstrapIndices(5, 7));
  assert.deepEqual(
    bootstrapRatioInterval([0, Math.log(2), Math.log(4)], 9, 1000),
    bootstrapRatioInterval([0, Math.log(2), Math.log(4)], 9, 1000)
  );
  const paired = bootstrapPairedIntervals(
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    9,
    2,
    1000
  );
  assert.equal(paired.intervals[1].lower - paired.intervals[0].lower, 1);
  assert.equal(paired.intervals[1].upper - paired.intervals[0].upper, 1);
  const unequal = bootstrapPairedIntervals(
    Array.from({ length: 20 }, (_, index) => [index / 100, index / 10]),
    11,
    2,
    1000
  );
  assert.ok(
    unequal.intervals[1].familyUpper - unequal.intervals[1].familyLower >
      unequal.intervals[0].familyUpper - unequal.intervals[0].familyLower
  );
  assert.throws(
    () => bootstrapPairedIntervals([[1, 2]], 9, 1, 10),
    /familyCount must equal the matrix width/
  );
});

test('benchmark statistics report paired ratios, slopes, and variation', () => {
  assert.equal(median([3, 1, 2, 4]), 2.5);
  assert.equal(logRatio(2, 1), Math.log(2));
  assert.equal(linearRegression([1, 2, 4], [1, 2, 4]).beta, 1);
  const variation = variationMetrics([1, 2, 3]);
  assert.equal(variation.median, 2);
  assert.ok(variation.sd > 0);
});

test('stratified max-T bootstrap is order-invariant and finite at zero variance', () => {
  const rows = [
    [0, 0],
    [1, 2],
    [0, 0],
    [1, 2],
  ];
  const options = {
    strata: [
      'baseline-first',
      'baseline-first',
      'candidate-first',
      'candidate-first',
    ],
    seed: 17,
    resamples: 500,
  };
  const first = bootstrapStratifiedMaxT({ rows, ...options });
  const shuffled = bootstrapStratifiedMaxT({
    rows: [rows[3], rows[0], rows[2], rows[1]],
    strata: [
      'candidate-first',
      'baseline-first',
      'candidate-first',
      'baseline-first',
    ],
    ...options,
  });
  assert.deepEqual(first, shuffled);
  assert.equal(first.method, 'stratified-max-t-studentized-bootstrap');
  assert.ok(
    first.intervals.every((interval) =>
      Object.values(interval).every((value) => Number.isFinite(value))
    )
  );
  assert.ok(
    first.intervals[1].familyUpper - first.intervals[1].familyLower >=
      first.intervals[0].familyUpper - first.intervals[0].familyLower
  );
});

test('studentized bootstrap gives degenerate outlier resamples a nonzero scale', () => {
  const result = bootstrapStratifiedMaxT({
    rows: Array.from({ length: 20 }, (_, index) => [index === 0 ? 1 : 0]),
    strata: Array.from({ length: 20 }, (_, index) =>
      index < 10 ? 'baseline-first' : 'candidate-first'
    ),
    seed: 2,
    resamples: 5_000,
  });

  assert.ok(result.degenerateResamples > 0);
  assert.ok(result.degenerateFallbacks > 0);
  assert.ok(result.familyCritical > 0);
});
