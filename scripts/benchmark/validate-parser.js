/* oxlint-disable complexity */
export function positiveFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function validateParserRecord(
  record,
  label,
  expected,
  isAttempt = false,
  driftThreshold = 0.15
) {
  if (
    !record ||
    typeof record !== 'object' ||
    !['baseline-first', 'candidate-first'].includes(record.processOrder)
  )
    throw new TypeError(`${label} has an invalid process order`);
  if (
    !Number.isInteger(record.seed) ||
    record.seed < 0 ||
    record.seed > 0xffffffff
  )
    throw new TypeError(`${label} has an invalid seed`);
  if (isAttempt && !Number.isInteger(record.index))
    throw new TypeError(`${label} has an invalid index`);
  if (
    !Array.isArray(record.workloadOrder) ||
    record.workloadOrder.length !== expected.size ||
    new Set(record.workloadOrder).size !== expected.size ||
    record.workloadOrder.some((key) => !expected.has(key))
  )
    throw new TypeError(`${label} has mismatched workload keys`);
  if (!Array.isArray(record.revisions) || record.revisions.length !== 2)
    throw new TypeError(`${label} must contain two revisions`);
  const revisions = new Set(
    record.revisions.map((revision) => revision?.revision)
  );
  if (
    revisions.size !== 2 ||
    !revisions.has('baseline') ||
    !revisions.has('candidate')
  )
    throw new TypeError(`${label} must contain baseline and candidate`);
  if (isAttempt) {
    if (typeof record.rejected !== 'boolean')
      throw new TypeError(`${label} has an invalid rejection flag`);
    if (
      !Array.isArray(record.rejectionReasons) ||
      record.rejectionReasons.some(
        (reason) => !['drift', 'structural-mismatch'].includes(reason)
      ) ||
      new Set(record.rejectionReasons).size !==
        record.rejectionReasons.length ||
      record.rejected !== Boolean(record.rejectionReasons.length) ||
      record.rejectionReason !== (record.rejectionReasons.join('+') || null)
    )
      throw new TypeError(`${label} has an invalid rejection reason`);
    if (
      !Array.isArray(record.drift) ||
      record.drift.length !== 2 ||
      record.drift.some(
        (value) =>
          typeof value !== 'number' || !Number.isFinite(value) || value < 0
      )
    )
      throw new TypeError(`${label} has invalid drift`);
    if (
      !Array.isArray(record.structuralMismatches) ||
      record.structuralMismatches.some((key) => typeof key !== 'string')
    )
      throw new TypeError(`${label} has invalid structural mismatches`);
    if (
      Boolean(record.structuralMismatches.length) !==
      record.rejectionReasons.includes('structural-mismatch')
    )
      throw new TypeError(`${label} has inconsistent structural rejection`);
    if (
      record.drift.some((value) => value > driftThreshold) !==
      record.rejectionReasons.includes('drift')
    )
      throw new TypeError(`${label} has inconsistent drift rejection`);
  }
  for (const revision of record.revisions)
    validateParserRevision(revision, label, expected, record.processOrder);
  if (isAttempt) {
    const expectedDrift = record.revisions.map((revision) =>
      Math.abs(
        revision.controlAfter.medianMs / revision.controlBefore.medianMs - 1
      )
    );
    if (
      record.drift.some(
        (value, index) => Math.abs(value - expectedDrift[index]) > 1e-12
      )
    )
      throw new TypeError(`${label} has inconsistent drift`);
    const structural = new Map(
      record.revisions.flatMap((revision) =>
        revision.workloads.map((workload) => [
          `${revision.revision}:${workload.key}`,
          workload.structural,
        ])
      )
    );
    const mismatches = [...expected].filter(
      (key) =>
        structural.get(`baseline:${key}`) !== structural.get(`candidate:${key}`)
    );
    if (
      JSON.stringify(mismatches) !== JSON.stringify(record.structuralMismatches)
    )
      throw new TypeError(`${label} has inconsistent structural mismatches`);
  }
}

function validateParserRevision(revision, label, expected, processOrder) {
  if (!revision || !['baseline', 'candidate'].includes(revision.revision))
    throw new TypeError(`${label} has invalid revisions`);
  if (
    !['baseline-first', 'candidate-first'].includes(revision.processOrder) ||
    revision.processOrder !== processOrder
  )
    throw new TypeError(`${label} has invalid revision process order`);
  validateControl(revision.controlBefore, `${label} controlBefore`);
  validateControl(revision.controlAfter, `${label} controlAfter`);
  if (!Array.isArray(revision.workloads))
    throw new TypeError(`${label} has invalid workloads`);
  const seen = new Set();
  for (const workload of revision.workloads) {
    if (
      !workload ||
      typeof workload.key !== 'string' ||
      !expected.has(workload.key) ||
      seen.has(workload.key)
    )
      throw new TypeError(`${label} has mismatched workload keys`);
    seen.add(workload.key);
    validateParserWorkload(workload, `${label} ${workload.key}`);
  }
  if (seen.size !== expected.size)
    throw new TypeError(`${label} has missing workload keys`);
}

function validateControl(control, label) {
  if (
    !control ||
    typeof control !== 'object' ||
    !positiveFinite(control.medianMs) ||
    !Array.isArray(control.samplesMs) ||
    control.samplesMs.length === 0 ||
    control.samplesMs.some((value) => !positiveFinite(value))
  )
    throw new TypeError(`${label} has invalid timings`);
}

function validateParserWorkload(workload, label) {
  if (!Number.isInteger(workload.repetitions) || workload.repetitions <= 0)
    throw new TypeError(`${label} has invalid repetitions`);
  for (const [name, values] of [
    ['calibrationSamplesMs', workload.calibrationSamplesMs],
    ['warmups', workload.warmups],
    ['warmupElapsedMs', workload.warmupElapsedMs],
    ['measured', workload.measured],
    ['measuredElapsedMs', workload.measuredElapsedMs],
  ]) {
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.some((value) => !positiveFinite(value))
    )
      throw new TypeError(
        `${label} has ${
          name === 'measured' || name === 'warmups'
            ? 'nonpositive timings'
            : `invalid ${name}`
        }`
      );
  }
  if (
    workload.warmups.length !== workload.warmupElapsedMs.length ||
    workload.measured.length !== workload.measuredElapsedMs.length
  )
    throw new TypeError(`${label} has inconsistent elapsed timings`);
  if (
    typeof workload.structural !== 'string' ||
    !workload.structural ||
    workload.checksum !== workload.structural ||
    !Number.isInteger(workload.consumed) ||
    workload.consumed < 0
  )
    throw new TypeError(`${label} has invalid structural digest or checksum`);
}
