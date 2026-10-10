import {
  DECISION_CONFIG_VERSION,
  MIN_VALID_BLOCKS,
  migrateLegacyDecisionConfig,
  validateDecisionConfig,
} from './config.js';
import { validateBatchMeasurements } from './validate-corpus-measurements.js';
import {
  corpusGroups,
  isPermutation,
  validateCorpusCorrectness,
} from './validate-corpus-metadata.js';
import { validateCorpusGroupSummaries } from './validate-corpus-summaries.js';

const ORDERS = ['ours-first', 'reference-first'];

export function validateCorpusArtifact(artifact) {
  if (
    !Array.isArray(artifact.replicates) ||
    artifact.replicates.length < MIN_VALID_BLOCKS
  )
    throw new TypeError('corpus artifact has insufficient valid replicates');
  const config =
    artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION
      ? validateDecisionConfig(artifact.config, 'corpus artifact')
      : migrateLegacyDecisionConfig(artifact, 'corpus');
  if (
    (config.replicates ?? artifact.replicates.length) !==
      artifact.replicates.length ||
    (config.batches ?? 6) !== 6
  )
    throw new TypeError(
      'corpus artifact has inconsistent replicate configuration'
    );
  if (artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION)
    validateCorpusCorrectness(artifact);
  else if (
    !artifact.correctness ||
    !Number.isInteger(artifact.correctness.accepted) ||
    artifact.correctness.accepted <= 0
  )
    throw new TypeError('corpus artifact has invalid correctness metadata');
  const expectedGroups = corpusGroups(artifact);
  if (expectedGroups.length < 2)
    throw new TypeError('corpus artifact has no complete comparison groups');
  const state = {
    config,
    expectedGroups,
    repetitionsByGroup: new Map(),
    checksumsByGroup: new Map(),
    allChecksumsByGroup: new Map(),
  };
  const replicateIds = new Set();
  for (const [index, replicate] of artifact.replicates.entries()) {
    validateReplicateHeader(artifact, replicate, index, replicateIds, config);
    validateReplicateBatches(replicate, index, state);
  }
  validateCorpusGroupSummaries(
    artifact,
    expectedGroups,
    state.allChecksumsByGroup
  );
  return artifact;
}

function validateReplicateHeader(
  artifact,
  replicate,
  index,
  replicateIds,
  config
) {
  if (
    !Number.isInteger(replicate?.replicate) ||
    replicate.replicate < 0 ||
    replicateIds.has(replicate.replicate)
  )
    throw new TypeError(`corpus replicate ${index} has an invalid id`);
  replicateIds.add(replicate.replicate);
  if (config.calibrationOrderBalanced === true)
    validateCalibrationBalance(artifact, replicate, index);
  if (
    !Array.isArray(replicate.permutation) ||
    !isPermutation(replicate.permutation, artifact.correctness.accepted)
  )
    throw new TypeError(`corpus replicate ${index} has an invalid permutation`);
  if (!Array.isArray(replicate.batches) || replicate.batches.length !== 6)
    throw new TypeError(`corpus replicate ${index} must contain six batches`);
}

function validateCalibrationBalance(artifact, replicate, index) {
  if (!ORDERS.includes(replicate.calibrationOrder))
    throw new TypeError(
      `corpus replicate ${index} has an invalid calibration order`
    );
  for (const expectedOrder of ORDERS) {
    const count = artifact.replicates.filter(
      (item) => item.calibrationOrder === expectedOrder
    ).length;
    if (Math.abs(count - artifact.replicates.length / 2) > 1)
      throw new TypeError('corpus calibration orders are unbalanced');
  }
}

function validateReplicateBatches(replicate, index, state) {
  const orderCounts = { 'ours-first': 0, 'reference-first': 0 };
  for (const [batchIndex, batch] of replicate.batches.entries()) {
    if (
      !batch ||
      !ORDERS.includes(batch.order) ||
      !Array.isArray(batch.measurements)
    )
      throw new TypeError(`corpus replicate ${index} has invalid batch order`);
    orderCounts[batch.order]++;
    validateBatchMeasurements(batch, batchIndex, replicate, index, state);
  }
  if (orderCounts['ours-first'] !== 3 || orderCounts['reference-first'] !== 3)
    throw new TypeError(
      `corpus replicate ${index} has unbalanced process orders`
    );
}
