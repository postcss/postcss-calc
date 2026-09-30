/* oxlint-disable complexity */
import {
  CORPUS_CATEGORIES,
  NEUTRAL_CORPUS_CATEGORIES,
} from '../lib/corpus-policy.js';
import {
  DECISION_CONFIG_VERSION,
  MIN_VALID_BLOCKS,
  migrateLegacyDecisionConfig,
  validateDecisionConfig,
} from './config.js';
import { positiveFinite } from './validate-parser.js';
import { validateCorpusGroupSummaries } from './validate-corpus-summaries.js';

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
  const repetitionsByGroup = new Map();
  const checksumsByGroup = new Map();
  const allChecksumsByGroup = new Map();
  const replicateIds = new Set();
  for (const [index, replicate] of artifact.replicates.entries()) {
    if (
      !Number.isInteger(replicate?.replicate) ||
      replicate.replicate < 0 ||
      replicateIds.has(replicate.replicate)
    )
      throw new TypeError(`corpus replicate ${index} has an invalid id`);
    replicateIds.add(replicate.replicate);
    if (config.calibrationOrderBalanced === true) {
      if (
        !['ours-first', 'reference-first'].includes(replicate.calibrationOrder)
      )
        throw new TypeError(
          `corpus replicate ${index} has an invalid calibration order`
        );
      for (const expectedOrder of ['ours-first', 'reference-first']) {
        const count = artifact.replicates.filter(
          (item) => item.calibrationOrder === expectedOrder
        ).length;
        if (Math.abs(count - artifact.replicates.length / 2) > 1)
          throw new TypeError('corpus calibration orders are unbalanced');
      }
    }
    if (
      !Array.isArray(replicate.permutation) ||
      !isPermutation(replicate.permutation, artifact.correctness.accepted)
    )
      throw new TypeError(
        `corpus replicate ${index} has an invalid permutation`
      );
    if (!Array.isArray(replicate.batches) || replicate.batches.length !== 6)
      throw new TypeError(`corpus replicate ${index} must contain six batches`);
    const orderCounts = { 'ours-first': 0, 'reference-first': 0 };
    for (const [batchIndex, batch] of replicate.batches.entries()) {
      if (
        !batch ||
        !['ours-first', 'reference-first'].includes(batch.order) ||
        !Array.isArray(batch.measurements)
      )
        throw new TypeError(
          `corpus replicate ${index} has invalid batch order`
        );
      orderCounts[batch.order]++;
      const seenGroups = new Set();
      if (batch.measurements.length !== expectedGroups.length)
        throw new TypeError(
          `corpus replicate ${index} batch ${batchIndex} has incomplete groups`
        );
      for (const measurement of batch.measurements) {
        if (
          !measurement ||
          typeof measurement.group !== 'string' ||
          !expectedGroups.includes(measurement.group) ||
          seenGroups.has(measurement.group)
        )
          throw new TypeError(
            `corpus replicate ${index} batch ${batchIndex} has invalid groups`
          );
        seenGroups.add(measurement.group);
        if (
          !Number.isInteger(measurement.repetitions) ||
          measurement.repetitions <= 0
        )
          throw new TypeError(
            `corpus replicate ${index} has invalid repetitions`
          );
        const replicateGroup = `${replicate.replicate}:${measurement.group}`;
        const previousRepetitions = repetitionsByGroup.get(replicateGroup);
        if (
          previousRepetitions !== undefined &&
          previousRepetitions !== measurement.repetitions
        )
          throw new TypeError(
            `corpus group ${measurement.group} has inconsistent repetitions`
          );
        repetitionsByGroup.set(replicateGroup, measurement.repetitions);
        if (
          !Array.isArray(measurement.calibrationSamplesMs) ||
          measurement.calibrationSamplesMs.length === 0
        )
          throw new TypeError(
            `corpus replicate ${index} has invalid calibration samples`
          );
        for (const sample of measurement.calibrationSamplesMs) {
          if (
            !sample ||
            !positiveFinite(sample.oursMs) ||
            !positiveFinite(sample.referenceMs)
          )
            throw new TypeError(
              `corpus replicate ${index} has invalid calibration timings`
            );
        }
        if (
          config.calibrationOrderBalanced === true &&
          measurement.calibrationOrder !== replicate.calibrationOrder
        )
          throw new TypeError(
            `corpus replicate ${index} has an inconsistent calibration order`
          );
        for (const implementation of ['ours', 'reference']) {
          const result = measurement[implementation];
          if (
            !result ||
            !positiveFinite(result.ms) ||
            !positiveFinite(result.elapsedMs) ||
            !Number.isInteger(result.checksum) ||
            result.checksum < 0
          )
            throw new TypeError(
              `corpus replicate ${index} has nonpositive timings`
            );
          const checksumKey = `${replicate.replicate}:${measurement.group}:${implementation}`;
          const previousChecksum = checksumsByGroup.get(checksumKey);
          if (
            previousChecksum !== undefined &&
            previousChecksum !== result.checksum
          )
            throw new TypeError(
              `corpus group ${measurement.group} has inconsistent checksums`
            );
          checksumsByGroup.set(checksumKey, result.checksum);
          const allChecksums =
            allChecksumsByGroup.get(measurement.group) ?? new Set();
          allChecksums.add(result.checksum);
          allChecksumsByGroup.set(measurement.group, allChecksums);
        }
      }
      if (seenGroups.size !== expectedGroups.length)
        throw new TypeError(
          `corpus replicate ${index} batch ${batchIndex} has missing groups`
        );
    }
    if (orderCounts['ours-first'] !== 3 || orderCounts['reference-first'] !== 3)
      throw new TypeError(
        `corpus replicate ${index} has unbalanced process orders`
      );
  }
  validateCorpusGroupSummaries(artifact, expectedGroups, allChecksumsByGroup);
  return artifact;
}

function validateCorpusCorrectness(artifact) {
  const correctness = artifact.correctness;
  if (
    !correctness ||
    !Number.isInteger(correctness.accepted) ||
    correctness.accepted <= 0
  )
    throw new TypeError('corpus artifact has invalid correctness metadata');
  if (!correctness.counts || !correctness.categoryHashes)
    throw new TypeError('corpus artifact is missing corpus category metadata');
  for (const category of CORPUS_CATEGORIES) {
    if (
      !Number.isInteger(correctness.counts[category]) ||
      correctness.counts[category] < 0
    )
      throw new TypeError(`corpus artifact has invalid ${category} count`);
    if (typeof correctness.categoryHashes[category] !== 'string')
      throw new TypeError(`corpus artifact has invalid ${category} hash`);
    if (
      category !== 'accepted' &&
      !NEUTRAL_CORPUS_CATEGORIES.has(category) &&
      correctness.counts[category] !== 0
    )
      throw new TypeError(
        `corpus artifact contains non-neutral ${category} inputs`
      );
  }
  if (correctness.counts.accepted !== correctness.accepted)
    throw new TypeError('corpus artifact has inconsistent accepted counts');
  if (
    typeof correctness.inputHash !== 'string' ||
    correctness.inputHash.length === 0
  )
    throw new TypeError('corpus artifact has an invalid input hash');
}

function corpusGroups(artifact) {
  const strata = artifact.corpus?.lengthStrata;
  const shapes = artifact.corpus?.rootShapeCounts;
  if (
    !strata ||
    !shapes ||
    typeof strata !== 'object' ||
    typeof shapes !== 'object'
  )
    throw new TypeError('corpus artifact is missing group metadata');
  const groups = ['exact'];
  for (const [group, count] of Object.entries(shapes).sort())
    if (Number.isInteger(count) && count > 0) groups.push(group);
  for (const [group, count] of Object.entries(strata).sort())
    if (Number.isInteger(count) && count > 0) groups.push(group);
  return groups;
}

function isPermutation(values, length) {
  return (
    Number.isInteger(length) &&
    Array.isArray(values) &&
    values.length === length &&
    values.every(
      (value) => Number.isInteger(value) && value >= 0 && value < length
    ) &&
    new Set(values).size === length
  );
}
