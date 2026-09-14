import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  analyzeCorpus,
  CORPUS_EQUIVALENCE_MARGIN,
  groupResults,
} from '../../scripts/lib/corpus-benchmark.js';
import {
  CORPUS_INTERVAL_METHOD,
  DECISION_CONFIG_VERSION,
  PRECISION_METHOD,
} from '../../scripts/lib/benchmark.js';

function artifact(ratioForReplicate) {
  const groups = ['exact', 'sum'];
  const replicates = Array.from({ length: 20 }, (_, replicate) => ({
    replicate,
    calibrationOrder: replicate < 10 ? 'ours-first' : 'reference-first',
    permutation: [0, 1],
    batches: Array.from({ length: 6 }, (unusedBatch, batch) => ({
      order: batch < 3 ? 'ours-first' : 'reference-first',
      measurements: groups.map((group) => {
        const ratio = ratioForReplicate(replicate);
        return {
          group,
          repetitions: 1,
          calibrationOrder: replicate < 10 ? 'ours-first' : 'reference-first',
          calibrationSamplesMs: [{ oursMs: ratio, referenceMs: 1 }],
          ours: {
            ms: ratio,
            elapsedMs: ratio,
            checksum: group === 'exact' ? 1 : 2,
          },
          reference: {
            ms: 1,
            elapsedMs: 1,
            checksum: group === 'exact' ? 1 : 2,
          },
        };
      }),
    })),
  }));
  return {
    schema: 2,
    benchmark: 'corpus',
    seed: 123,
    config: {
      requestedBlocks: 20,
      minimumBlocks: 20,
      equivalenceMargin: CORPUS_EQUIVALENCE_MARGIN,
      bootstrapResamples: 1_000,
      orderInteractionThreshold: Math.log(1.1),
    },
    corpus: {
      lengthStrata: { 'source-length-q1': 2 },
      rootShapeCounts: { sum: 2 },
    },
    correctness: { accepted: 2 },
    replicates,
  };
}

function strictArtifact(ratioForReplicate) {
  const value = artifact(ratioForReplicate);
  const categories = [
    'accepted',
    'both-failed',
    'known-divergence',
    'malformed-input',
    'parser-rejected',
    'reference-rejected',
    'unexpected-divergence',
  ];
  value.config = {
    decisionConfigVersion: DECISION_CONFIG_VERSION,
    requestedBlocks: 20,
    minimumBlocks: 20,
    maxAttempts: 20,
    targetBatchMs: 25,
    warmupMinimum: 0,
    warmupMaximum: 0,
    measuredBatchCount: 6,
    driftThreshold: 0.15,
    bootstrapResamples: 1_000,
    confidence: 0.95,
    runtimeNonRegressionMargin: 1.1,
    equivalenceMargin: 1.1,
    precisionMargin: 1.1,
    precisionMethod: PRECISION_METHOD,
    growthThreshold: 2.5,
    orderInteractionThreshold: Math.log(1.1),
    intervalMethod: CORPUS_INTERVAL_METHOD,
    replicates: 20,
    batches: 6,
    calibrationOrderBalanced: true,
  };
  value.correctness = {
    accepted: 2,
    counts: Object.fromEntries(
      categories.map((category) => [category, category === 'accepted' ? 2 : 0])
    ),
    categoryHashes: Object.fromEntries(
      categories.map((category) => [category, category])
    ),
    inputHash: 'inputs',
  };
  value.corpus = { lengthStrata: {}, rootShapeCounts: { sum: 2 } };
  delete value.analysis;
  return value;
}

function makePairedReplicates(reverseSecondOrder) {
  return Array.from({ length: 20 }, (unusedReplicate, replicate) => {
    const centeredLog = (replicate - 9.5) / 10;
    const ratios = [
      Math.exp(centeredLog),
      Math.exp(reverseSecondOrder ? -centeredLog : centeredLog),
    ];
    return {
      replicate,
      batches: Array.from({ length: 6 }, (unusedBatch, batch) => {
        const orderIndex = batch < 3 ? 0 : 1;
        const ratio = ratios[orderIndex];
        return {
          order: orderIndex === 0 ? 'ours-first' : 'reference-first',
          measurements: [
            {
              group: 'exact',
              ours: { ms: ratio, checksum: 1 },
              reference: { ms: 1, checksum: 1 },
            },
          ],
        };
      }),
    };
  });
}

function workerChecksum(result) {
  return JSON.parse(result.stdout).batches[0].measurements.find(
    (measurement) => measurement.group === 'exact'
  ).ours.checksum;
}

test('corpus analysis keeps superiority and practical verdicts separate', () => {
  const precise = analyzeCorpus(artifact(() => 1.01));
  assert.equal(precise.status, 'postcss-calc slower');
  assert.equal(precise.practical.status, 'equivalent');

  const faster = analyzeCorpus(artifact(() => 0.9));
  assert.equal(faster.status, 'postcss-calc faster');

  const slower = analyzeCorpus(artifact(() => 1.2));
  assert.equal(slower.status, 'postcss-calc slower');

  const noisy = analyzeCorpus(
    artifact((replicate) => (replicate % 2 ? 0.7 : 1.3))
  );
  assert.equal(noisy.status, 'inconclusive');
  assert.equal(noisy.practical.status, 'inconclusive');
  assert.equal(noisy.decisions.exact.precisionTargetMet, false);
  assert.ok(
    noisy.decisions.exact.intervalHalfWidth >
      noisy.decisions.exact.targetHalfWidth
  );
});

test('group bootstrap seeds use digest contents', () => {
  const first = analyzeCorpus(artifact(() => 1.01));
  const second = analyzeCorpus(artifact(() => 1.02));
  assert.notEqual(
    first.groups.exact.bootstrapSeed,
    first.groups.sum.bootstrapSeed
  );
  assert.equal(
    first.groups.exact.bootstrapSeed,
    second.groups.exact.bootstrapSeed
  );
});

test('corpus bootstrap resamples both order observations as one replicate', () => {
  const positivelyPaired = groupResults(
    makePairedReplicates(false),
    73,
    5_000
  ).exact;
  const negativelyPaired = groupResults(
    makePairedReplicates(true),
    73,
    5_000
  ).exact;

  assert.equal(
    positivelyPaired.bootstrapMethod,
    'paired-replicate-order-log-ratio-bootstrap'
  );
  assert.ok(positivelyPaired.bootstrap95.lowerRatio < 1);
  assert.ok(positivelyPaired.bootstrap95.upperRatio > 1);
  assert.ok(Math.abs(negativelyPaired.bootstrap95.lowerRatio - 1) < 1e-12);
  assert.ok(Math.abs(negativelyPaired.bootstrap95.upperRatio - 1) < 1e-12);
});

test('corpus worker verifies public reducer outputs and hashes their content', () => {
  const temp = mkdtempSync(join(tmpdir(), 'postcss-calc-worker-test-'));
  const corpusFile = join(temp, 'corpus.json');
  const run = (entry) => {
    writeFileSync(corpusFile, JSON.stringify([entry]));
    const payload = {
      sourceRoot: join(process.cwd(), 'src'),
      corpusFile,
      permutation: [0],
      orders: ['ours-first'],
      calibrationOrder: 'ours-first',
      targetBatchMs: 0.1,
      replicate: 0,
      lengthQuartiles: [
        entry.sourceLength,
        entry.sourceLength,
        entry.sourceLength,
      ],
    };
    return spawnSync(
      process.execPath,
      [
        join(process.cwd(), 'scripts/corpus-benchmark-worker.js'),
        JSON.stringify(payload),
      ],
      { encoding: 'utf8' }
    );
  };
  try {
    const first = run({
      input: 'calc(1px + 1px)',
      canonical: 'calc(2px)',
      shape: 'sum',
      sourceLength: 15,
      lengthStratum: 'source-length-q1',
    });
    const second = run({
      input: 'calc(1px + 2px)',
      canonical: 'calc(3px)',
      shape: 'sum',
      sourceLength: 15,
      lengthStratum: 'source-length-q1',
    });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.notEqual(workerChecksum(first), workerChecksum(second));

    const mismatch = run({
      input: 'calc(1px + 1px)',
      canonical: 'calc(3px)',
      shape: 'sum',
      sourceLength: 15,
      lengthStratum: 'source-length-q1',
    });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /public reduceCalc output differs/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('corpus reanalysis derives decisions from raw observations', () => {
  const raw = strictArtifact(() => 1.01);
  const withoutSummaries = analyzeCorpus(raw);
  assert.equal(withoutSummaries.groups.exact.ratios.length, 20);
  raw.analysis = withoutSummaries;

  const tamperedRatio = structuredClone(raw);
  tamperedRatio.analysis.groups.exact.ratios[0] = 1.5;
  assert.throws(() => analyzeCorpus(tamperedRatio), /not derived|recomputed/);

  const tamperedDecision = structuredClone(raw);
  tamperedDecision.analysis.decisions.exact.practical = 'not-equivalent';
  assert.throws(
    () => analyzeCorpus(tamperedDecision),
    /recomputed observations/
  );

  const omitted = structuredClone(raw);
  delete omitted.analysis;
  assert.doesNotThrow(() => analyzeCorpus(omitted));
});
