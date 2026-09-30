/* oxlint-disable complexity, no-bitwise */
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
    if (
      !summary ||
      summary.replicates !== artifact.replicates.length ||
      !Array.isArray(summary.ratios) ||
      summary.ratios.length !== artifact.replicates.length ||
      summary.ratios.some((ratio) => !positiveFinite(ratio)) ||
      !Array.isArray(summary.checksums) ||
      summary.checksums.length === 0 ||
      summary.checksums.some(
        (checksum) => !Number.isInteger(checksum) || checksum < 0
      )
    )
      throw new TypeError(`corpus group ${group} has invalid summary`);
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
    if (summary.bootstrap95) {
      const digest = stableHash(group);
      const groupSeed =
        (artifact.seed ^ Number.parseInt(digest.slice(0, 8), 16)) >>> 0;
      const expectedBootstrap = bootstrapCorpusInterval(
        corpusRawReplicatePairs(artifact, group),
        groupSeed,
        artifact.config?.bootstrapResamples ?? BOOTSTRAP_RESAMPLES,
        0.95
      );
      if (
        Math.abs(
          summary.bootstrap95.lowerRatio - Math.exp(expectedBootstrap.lower)
        ) > 1e-12 ||
        Math.abs(
          summary.bootstrap95.upperRatio - Math.exp(expectedBootstrap.upper)
        ) > 1e-12
      )
        throw new TypeError(
          `corpus group ${group} interval is not derived from raw observations`
        );
      if (summary.bootstrap90) {
        const expectedNinety = bootstrapCorpusInterval(
          corpusRawReplicatePairs(artifact, group),
          (groupSeed ^ 0x9e3779b9) >>> 0,
          artifact.config?.bootstrapResamples ?? BOOTSTRAP_RESAMPLES,
          0.9
        );
        if (
          Math.abs(
            summary.bootstrap90.lowerRatio - Math.exp(expectedNinety.lower)
          ) > 1e-12 ||
          Math.abs(
            summary.bootstrap90.upperRatio - Math.exp(expectedNinety.upper)
          ) > 1e-12
        )
          throw new TypeError(
            `corpus group ${group} practical interval is not derived from raw observations`
          );
      }
    }
    const expectedChecksums = allChecksumsByGroup.get(group) ?? new Set();
    if (
      summary.checksums.length !== expectedChecksums.size ||
      summary.checksums.some((checksum) => !expectedChecksums.has(checksum))
    )
      throw new TypeError(`corpus group ${group} has inconsistent checksums`);
  }
  if (artifact.analysis?.status) {
    if (
      !['postcss-calc faster', 'postcss-calc slower', 'inconclusive'].includes(
        artifact.analysis.status
      )
    )
      throw new TypeError('corpus artifact has an invalid statistical status');
    if (
      artifact.analysis.statistical?.status !== undefined &&
      artifact.analysis.statistical.status !== artifact.analysis.status
    )
      throw new TypeError(
        'corpus artifact has inconsistent statistical status'
      );
    if (
      artifact.analysis.practical?.margin !== undefined &&
      artifact.analysis.practical.margin !== artifact.config.equivalenceMargin
    )
      throw new TypeError(
        'corpus artifact has inconsistent equivalence margin'
      );
  }
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
