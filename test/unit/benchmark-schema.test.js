import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECISION_CONFIG_VERSION,
  PRECISION_METHOD,
  validateSchemaV2Artifact,
} from '../../scripts/benchmark/benchmark.js';
import { analyzeParser } from '../../scripts/benchmark/parser-benchmark.js';

function artifact() {
  const workloadKeys = ['shape:mode:1', 'shape:mode:16000'];
  return {
    schema: 2,
    seed: 1,
    workloadKeys,
    config: { blocks: 20, maxAttempts: 30 },
    blocks: Array.from({ length: 20 }, (_, index) => ({
      index,
      processOrder: index % 2 ? 'candidate-first' : 'baseline-first',
      workloadOrder: workloadKeys,
      rejected: false,
      rejectionReasons: [],
      rejectionReason: null,
      drift: [0, 0],
      structuralMismatches: [],
      revisions: ['baseline', 'candidate'].map((revision) => ({
        revision,
        processOrder: index % 2 ? 'candidate-first' : 'baseline-first',
        controlBefore: { medianMs: 1, samplesMs: [1] },
        controlAfter: { medianMs: 1, samplesMs: [1] },
        workloads: workloadKeys.map((key) => ({
          key,
          repetitions: 1,
          calibrationSamplesMs: [1],
          warmups: [1],
          warmupElapsedMs: [1],
          measured: [1, 2],
          measuredElapsedMs: [1, 2],
          structural: `digest-${key}`,
          checksum: `digest-${key}`,
          consumed: 1,
        })),
      })),
      seed: index + 2,
    })),
  };
}

function corpusArtifact() {
  const groups = ['exact', 'sum', 'source-length-q1'];
  const measurements = (group) => ({
    group,
    repetitions: 1,
    calibrationSamplesMs: [{ oursMs: 1, referenceMs: 1 }],
    ours: { ms: 1, elapsedMs: 1, checksum: groups.indexOf(group) },
    reference: { ms: 1, elapsedMs: 1, checksum: groups.indexOf(group) },
  });
  const replicates = Array.from(
    { length: 20 },
    (unusedReplicate, replicate) => ({
      replicate,
      permutation: Array.from(
        { length: 20 },
        (unusedPosition, position) => position
      ),
      batches: Array.from({ length: 6 }, (unusedBatch, batchIndex) => ({
        order: batchIndex < 3 ? 'ours-first' : 'reference-first',
        measurements: groups.map(measurements),
      })),
    })
  );
  const summaries = Object.fromEntries(
    groups.map((group) => [
      group,
      {
        replicates: 20,
        ratios: Array(20).fill(1),
        checksums: [groups.indexOf(group)],
      },
    ])
  );
  return {
    schema: 2,
    benchmark: 'corpus',
    seed: 1,
    config: { replicates: 20, batches: 6 },
    correctness: {
      accepted: 20,
      counts: Object.fromEntries(
        [
          'accepted',
          'both-failed',
          'known-divergence',
          'malformed-input',
          'parser-rejected',
          'reference-rejected',
          'unexpected-divergence',
        ].map((category) => [category, category === 'accepted' ? 20 : 0])
      ),
      categoryHashes: Object.fromEntries(
        [
          'accepted',
          'both-failed',
          'known-divergence',
          'malformed-input',
          'parser-rejected',
          'reference-rejected',
          'unexpected-divergence',
        ].map((category) => [category, category])
      ),
      inputHash: 'inputs',
    },
    corpus: {
      lengthStrata: { 'source-length-q1': 20 },
      rootShapeCounts: { sum: 20 },
    },
    replicates,
    analysis: { groups: summaries },
  };
}

test('parser analysis shares one family adjustment across all gated claims', () => {
  const matching = analyzeParser(artifact());
  assert.equal(matching.status, 'pass');
  assert.equal(matching.endpoints[0].bootstrap95.familyCount, 4);
  assert.equal(matching.slopes.endpoints[0].bootstrap95.familyCount, 4);
  assert.equal(matching.growth[0].bootstrap95.familyCount, 4);

  const regression = artifact();
  for (const block of regression.blocks) {
    const workloads = block.revisions.find(
      (revision) => revision.revision === 'candidate'
    ).workloads;
    for (const workload of workloads) workload.measured = [2, 4];
  }
  assert.equal(analyzeParser(regression).status, 'regression');
});

test('parser regression is inconclusive when its family interval misses precision', () => {
  const noisy = artifact();
  for (const [index, block] of noisy.blocks.entries()) {
    const candidateFactor = index % 4 < 2 ? 1.35 : 2.5;
    for (const revision of block.revisions) {
      const isCandidate = revision.revision === 'candidate';
      for (const workload of revision.workloads) {
        const value = isCandidate ? candidateFactor : 1;
        workload.measured = [value];
        workload.measuredElapsedMs = [value];
      }
    }
  }

  const analysis = analyzeParser(noisy);
  const largest = analysis.endpoints.find((item) =>
    item.key.endsWith(':16000')
  );
  assert.ok(largest.familyAdjusted95.lowerRatio > 1.1);
  assert.equal(largest.precision.targetMet, false);
  assert.equal(analysis.runtimeStatus, 'inconclusive');
});

test('schema-v2 validation rejects missing keys and nonpositive timings', () => {
  assert.doesNotThrow(() => validateSchemaV2Artifact(artifact()));
  const missing = artifact();
  missing.blocks[0].revisions[0].workloads.pop();
  assert.throws(
    () => validateSchemaV2Artifact(missing),
    /missing workload keys/
  );
  const nonpositive = artifact();
  nonpositive.blocks[0].revisions[0].workloads[0].measured[0] = 0;
  assert.throws(
    () => validateSchemaV2Artifact(nonpositive),
    /nonpositive timings/
  );
});

test('schema-v2 decision configuration is complete and authoritative', () => {
  const strict = artifact();
  strict.config = {
    decisionConfigVersion: DECISION_CONFIG_VERSION,
    requestedBlocks: 20,
    minimumBlocks: 20,
    maxAttempts: 20,
    targetBatchMs: 25,
    warmupMinimum: 5,
    warmupMaximum: 10,
    measuredBatchCount: 6,
    driftThreshold: 0.15,
    bootstrapResamples: 100,
    confidence: 0.95,
    runtimeNonRegressionMargin: 1.1,
    equivalenceMargin: 1.1,
    precisionMargin: 1.1,
    precisionMethod: PRECISION_METHOD,
    growthThreshold: 2.5,
    orderInteractionThreshold: Math.log(1.1),
    intervalMethod: 'stratified-max-t-studentized-bootstrap',
  };
  assert.doesNotThrow(() => validateSchemaV2Artifact(strict));
  for (const key of ['precisionMargin', 'confidence', 'intervalMethod']) {
    const missing = structuredClone(strict);
    delete missing.config[key];
    assert.throws(
      () => validateSchemaV2Artifact(missing),
      new RegExp(`missing decision parameter ${key}`)
    );
  }
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const invalid = structuredClone(strict);
    invalid.config.precisionMargin = value;
    assert.throws(() => validateSchemaV2Artifact(invalid), /precisionMargin/);
  }
  const inconsistent = structuredClone(strict);
  inconsistent.config.maxAttempts = 19;
  assert.throws(() => validateSchemaV2Artifact(inconsistent), /maxAttempts/);
});

test('schema-v2 validation enforces the twenty-block statistical floor', () => {
  const insufficient = artifact();
  insufficient.blocks = insufficient.blocks.slice(0, 1);
  assert.throws(
    () => validateSchemaV2Artifact(insufficient),
    /fewer than 20 valid blocks/
  );
});

test('schema-v2 validates retained attempts and raw timing fields', () => {
  const retained = artifact();
  retained.attempts = structuredClone(retained.blocks);
  retained.attempts[0].revisions[0].workloads[0].measuredElapsedMs[0] = 0;
  assert.throws(
    () => validateSchemaV2Artifact(retained),
    /attempt 0 .*invalid measuredElapsedMs/
  );

  const inconsistent = artifact();
  inconsistent.attempts = structuredClone(inconsistent.blocks);
  inconsistent.attempts[0].rejectionReason = 'drift';
  assert.throws(
    () => validateSchemaV2Artifact(inconsistent),
    /invalid rejection reason/
  );
});

test('schema-v2 corpus validation requires complete replicated groups', () => {
  const valid = corpusArtifact();
  assert.doesNotThrow(() => validateSchemaV2Artifact(valid));
  const incomplete = structuredClone(valid);
  incomplete.replicates[0].batches[0].measurements = [];
  assert.throws(
    () => validateSchemaV2Artifact(incomplete),
    /incomplete groups/
  );
  const unbalanced = structuredClone(valid);
  unbalanced.replicates[0].batches[0].order = 'reference-first';
  assert.throws(
    () => validateSchemaV2Artifact(unbalanced),
    /unbalanced process orders/
  );
  const invalidPermutation = structuredClone(valid);
  invalidPermutation.replicates[0].permutation[0] = 1;
  assert.throws(
    () => validateSchemaV2Artifact(invalidPermutation),
    /invalid permutation/
  );
});

test('parser reanalysis stays inconclusive below the statistical floor', () => {
  const insufficient = artifact();
  insufficient.blocks = insufficient.blocks.slice(0, 1);
  insufficient.analysis = { status: 'inconclusive' };
  const malformedAttempt = { ...insufficient, attempts: [{}] };
  assert.throws(
    () => validateSchemaV2Artifact(malformedAttempt),
    /attempt 0 has an invalid process order/
  );
  insufficient.attempts = [insufficient.blocks[0]];
  assert.deepEqual(analyzeParser(insufficient), {
    status: 'inconclusive',
    validBlocks: 1,
    reason: 'fewer than 20 valid blocks',
  });
});
