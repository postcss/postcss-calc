import { positiveFinite } from './validate-parser.js';

export function validateBatchMeasurements(
  batch,
  batchIndex,
  replicate,
  index,
  state
) {
  const { expectedGroups } = state;
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
    validateCorpusMeasurement(
      measurement,
      replicate,
      index,
      state.config,
      state.repetitionsByGroup,
      state.checksumsByGroup,
      state.allChecksumsByGroup
    );
  }
  if (seenGroups.size !== expectedGroups.length)
    throw new TypeError(
      `corpus replicate ${index} batch ${batchIndex} has missing groups`
    );
}

function validateCorpusMeasurement(
  measurement,
  replicate,
  index,
  config,
  repetitionsByGroup,
  checksumsByGroup,
  allChecksumsByGroup
) {
  validateMeasurementRepetitions(
    measurement,
    replicate,
    index,
    repetitionsByGroup
  );
  validateCalibrationSamples(measurement, index);
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
      throw new TypeError(`corpus replicate ${index} has nonpositive timings`);
    const checksumKey = `${replicate.replicate}:${measurement.group}:${implementation}`;
    const previousChecksum = checksumsByGroup.get(checksumKey);
    if (previousChecksum !== undefined && previousChecksum !== result.checksum)
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

function validateMeasurementRepetitions(
  measurement,
  replicate,
  index,
  repetitionsByGroup
) {
  if (
    !Number.isInteger(measurement.repetitions) ||
    measurement.repetitions <= 0
  )
    throw new TypeError(`corpus replicate ${index} has invalid repetitions`);
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
}

function validateCalibrationSamples(measurement, index) {
  if (
    !Array.isArray(measurement.calibrationSamplesMs) ||
    measurement.calibrationSamplesMs.length === 0
  )
    throw new TypeError(
      `corpus replicate ${index} has invalid calibration samples`
    );
  for (const sample of measurement.calibrationSamplesMs)
    if (
      !sample ||
      !positiveFinite(sample.oursMs) ||
      !positiveFinite(sample.referenceMs)
    )
      throw new TypeError(
        `corpus replicate ${index} has invalid calibration timings`
      );
}
