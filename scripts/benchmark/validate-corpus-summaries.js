/* oxlint-disable no-bitwise */
import { stableHash } from '../lib/corpus-policy.js';
import { bootstrapCorpusInterval } from './bootstrap.js';
import { BOOTSTRAP_RESAMPLES } from './config.js';
import { median } from './statistics.js';
import { positiveFinite } from './validate-parser.js';

export function validateCorpusGroupSummaries(
  artifact,
  expectedGroups,
  allChecksumsByGroup
) {
  const groups = artifact.analysis?.groups;
  if (artifact.analysis === undefined) return;
  if (!groups || typeof groups !== 'object' || Array.isArray(groups))
    throw new TypeError('corpus artifact is missing group summaries');
  const names = Object.keys(groups).sort();
  if (JSON.stringify(names) !== JSON.stringify([...expectedGroups].sort()))
    throw new TypeError('corpus artifact has incomplete group summaries');
  for (const group of expectedGroups) {
    const summary = groups[group];
    const rawRatios = corpusRawRatios(artifact, group);
    validateSummaryShape(artifact, group, summary);
    validateSummaryRatios(rawRatios, group, summary);
    if (summary.bootstrap95) validateSummaryIntervals(artifact, group, summary);
    validateSummaryChecksums(group, summary, allChecksumsByGroup);
  }
  if (artifact.analysis?.status) validateAnalysisStatus(artifact);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validateSummaryShape(artifact, group, summary) {
  const count = artifact.replicates.length;
  if (
    !summary ||
    summary.replicates !== count ||
    !Array.isArray(summary.ratios) ||
    summary.ratios.length !== count ||
    summary.ratios.some((ratio) => !positiveFinite(ratio)) ||
    !Array.isArray(summary.checksums) ||
    summary.checksums.length === 0 ||
    !summary.checksums.every(isNonNegativeInteger)
  )
    throw new TypeError(`corpus group ${group} has invalid summary`);
}

function validateSummaryRatios(rawRatios, group, summary) {
  if (
    rawRatios.length !== summary.ratios.length ||
    rawRatios.some(
      (ratio, index) => Math.abs(ratio - summary.ratios[index]) > 1e-12
    )
  )
    throw new TypeError(
      `corpus group ${group} summary is not derived from raw observations`
    );
  const rawLogs = rawRatios.map(Math.log);
  const rawMean =
    rawLogs.reduce((sum, value) => sum + value, 0) / rawLogs.length;
  if (
    summary.geometricMeanPairedRuntimeRatio !== undefined &&
    Math.abs(summary.geometricMeanPairedRuntimeRatio - Math.exp(rawMean)) >
      1e-12
  )
    throw new TypeError(
      `corpus group ${group} summary mean is not derived from raw observations`
    );
}

function intervalMatches(actual, expected) {
  return (
    Math.abs(actual.lowerRatio - Math.exp(expected.lower)) <= 1e-12 &&
    Math.abs(actual.upperRatio - Math.exp(expected.upper)) <= 1e-12
  );
}

function validateSummaryIntervals(artifact, group, summary) {
  const digest = stableHash(group);
  const groupSeed =
    (artifact.seed ^ Number.parseInt(digest.slice(0, 8), 16)) >>> 0;
  const resamples = artifact.config?.bootstrapResamples ?? BOOTSTRAP_RESAMPLES;
  const pairs = corpusRawReplicatePairs(artifact, group);
  const expected95 = bootstrapCorpusInterval(pairs, groupSeed, resamples, 0.95);
  if (!intervalMatches(summary.bootstrap95, expected95))
    throw new TypeError(
      `corpus group ${group} interval is not derived from raw observations`
    );
  if (!summary.bootstrap90) return;
  const expected90 = bootstrapCorpusInterval(
    pairs,
    (groupSeed ^ 0x9e3779b9) >>> 0,
    resamples,
    0.9
  );
  if (!intervalMatches(summary.bootstrap90, expected90))
    throw new TypeError(
      `corpus group ${group} practical interval is not derived from raw observations`
    );
}

function validateSummaryChecksums(group, summary, allChecksumsByGroup) {
  const expectedChecksums = allChecksumsByGroup.get(group) ?? new Set();
  if (
    summary.checksums.length !== expectedChecksums.size ||
    summary.checksums.some((checksum) => !expectedChecksums.has(checksum))
  )
    throw new TypeError(`corpus group ${group} has inconsistent checksums`);
}

function validateAnalysisStatus(artifact) {
  const { status, statistical, practical } = artifact.analysis;
  if (
    !['postcss-calc faster', 'postcss-calc slower', 'inconclusive'].includes(
      status
    )
  )
    throw new TypeError('corpus artifact has an invalid statistical status');
  if (statistical?.status !== undefined && statistical.status !== status)
    throw new TypeError('corpus artifact has inconsistent statistical status');
  if (
    practical?.margin !== undefined &&
    practical.margin !== artifact.config.equivalenceMargin
  )
    throw new TypeError('corpus artifact has inconsistent equivalence margin');
}

export function corpusRawRatios(artifact, group) {
  return corpusRawReplicatePairs(artifact, group).map(
    ([oursFirst, referenceFirst]) =>
      Math.exp((Math.log(oursFirst) + Math.log(referenceFirst)) / 2)
  );
}

export function corpusRawReplicatePairs(artifact, group) {
  return artifact.replicates.map((replicate) =>
    ['ours-first', 'reference-first'].map((order) => {
      const values = replicate.batches
        .filter((batch) => batch.order === order)
        .map((batch) =>
          batch.measurements.find((item) => item.group === group)
        );
      return (
        median(values.map((value) => value.ours.ms)) /
        median(values.map((value) => value.reference.ms))
      );
    })
  );
}
