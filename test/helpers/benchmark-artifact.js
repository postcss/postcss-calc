/* oxlint-disable no-bitwise */
import {
  DECISION_CONFIG_VERSION,
  DECISION_INTERVAL_METHOD,
  PRECISION_METHOD,
} from '../../scripts/lib/benchmark.js';

export const SYNTHETIC_DECISION_CONFIG = {
  decisionConfigVersion: DECISION_CONFIG_VERSION,
  requestedBlocks: 20,
  minimumBlocks: 20,
  maxAttempts: 20,
  targetBatchMs: 25,
  warmupMinimum: 5,
  warmupMaximum: 10,
  measuredBatchCount: 1,
  driftThreshold: 0.15,
  bootstrapResamples: 1_000,
  confidence: 0.95,
  runtimeNonRegressionMargin: 1.1,
  equivalenceMargin: 1.1,
  precisionMargin: 1.1,
  precisionMethod: PRECISION_METHOD,
  growthThreshold: 2.5,
  orderInteractionThreshold: Math.log(1.1),
  intervalMethod: DECISION_INTERVAL_METHOD,
};

/**
 * Build a parser artifact from already-generated observations. `rows` contains
 * one complete independent block per item, with baseline and candidate arrays
 * in the same endpoint order.
 */
export function syntheticParserArtifact({
  rows,
  seed = 0x510e,
  workloadKeys = rows[0]?.baseline.map((unused, index) => `endpoint:${index}`),
  config = {},
}) {
  if (!Array.isArray(rows) || rows.length < 20 || rows.length % 2 !== 0)
    throw new RangeError(
      'synthetic parser artifacts require an even 20-block sample'
    );
  const completeConfig = {
    ...SYNTHETIC_DECISION_CONFIG,
    requestedBlocks: rows.length,
    maxAttempts: rows.length,
    ...config,
  };
  const blocks = rows.map((row, index) => {
    const processOrder =
      row.processOrder ?? (index % 2 ? 'candidate-first' : 'baseline-first');
    const revision = (name) => ({
      revision: name,
      processOrder,
      controlBefore: { medianMs: 1, samplesMs: [1] },
      controlAfter: { medianMs: 1, samplesMs: [1] },
      workloads: workloadKeys.map((key, endpoint) => {
        const value = row[name][endpoint];
        return {
          key,
          repetitions: 1,
          calibrationSamplesMs: [value],
          warmups: [value],
          warmupElapsedMs: [value],
          measured: [value],
          measuredElapsedMs: [value],
          structural: 'synthetic',
          checksum: 'synthetic',
          consumed: 1,
        };
      }),
    });
    return {
      index,
      seed: (seed + index) >>> 0,
      processOrder,
      workloadOrder: [...workloadKeys],
      rejected: false,
      rejectionReasons: [],
      rejectionReason: null,
      drift: [0, 0],
      structuralMismatches: [],
      revisions: [revision('baseline'), revision('candidate')],
    };
  });
  return {
    schema: 2,
    benchmark: 'parser-simulation',
    seed,
    config: completeConfig,
    workloadKeys,
    blocks,
    attempts: structuredClone(blocks),
  };
}
