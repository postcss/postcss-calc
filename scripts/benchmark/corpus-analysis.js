/* oxlint-disable no-bitwise, complexity */
import { stableHash } from '../lib/corpus-policy.js';
import {
  BOOTSTRAP_RESAMPLES,
  bootstrapPairedReplicateInterval,
  CORPUS_INTERVAL_METHOD,
  DECISION_CONFIG_VERSION,
  decisionConfigForArtifact,
  median,
  ordinaryInterval,
  validateSchemaV2Artifact,
  variationMetrics,
} from './benchmark.js';

export function groupResults(
  replicates,
  seed = 0,
  resamples = BOOTSTRAP_RESAMPLES
) {
  const groups = new Map();
  for (const replicate of replicates)
    for (const batch of replicate.batches)
      for (const measurement of batch.measurements) {
        const key = measurement.group;
        if (!Number.isInteger(replicate.replicate))
          throw new TypeError('corpus worker omitted its replicate number');
        const values = groups.get(key) ?? [];
        values.push({
          replicate: replicate.replicate,
          order: batch.order,
          ours: measurement.ours.ms,
          reference: measurement.reference.ms,
          oursChecksum: measurement.ours.checksum,
          referenceChecksum: measurement.reference.checksum,
        });
        groups.set(key, values);
      }
  const result = {};
  for (const [group, values] of groups) {
    const byReplicate = new Map();
    for (const value of values) {
      const current = byReplicate.get(value.replicate) ?? {
        ours: [],
        reference: [],
        checksums: [],
        byOrder: { 'ours-first': [], 'reference-first': [] },
      };
      current.ours.push(value.ours);
      current.reference.push(value.reference);
      current.checksums.push([value.oursChecksum, value.referenceChecksum]);
      current.byOrder[value.order].push(value);
      byReplicate.set(value.replicate, current);
    }
    const replicatePairs = [...byReplicate.values()].map((value) => {
      const orderRatios = ['ours-first', 'reference-first'].map((order) => {
        const measurements = value.byOrder[order];
        if (measurements.length === 0)
          throw new RangeError(
            `corpus replicate omitted ${order} measurements`
          );
        return (
          median(measurements.map((item) => item.ours)) /
          median(measurements.map((item) => item.reference))
        );
      });
      return orderRatios;
    });
    const ratios = replicatePairs.map(([oursFirst, referenceFirst]) =>
      Math.exp((Math.log(oursFirst) + Math.log(referenceFirst)) / 2)
    );
    const logs = ratios.map(Math.log);
    const ordinary = ordinaryInterval(logs);
    const groupSeed =
      (seed ^ Number.parseInt(stableHash(group).slice(0, 8), 16)) >>> 0;
    const byOrder = {};
    for (const [orderIndex, order] of [
      'ours-first',
      'reference-first',
    ].entries()) {
      const orderRatios = replicatePairs.map((pair) => pair[orderIndex]);
      const orderInterval = ordinaryInterval(orderRatios.map(Math.log));
      byOrder[order] = {
        replicates: orderRatios.length,
        ratios: orderRatios,
        geometricMeanPairedRuntimeRatio: Math.exp(orderInterval.mean),
        ordinary95: {
          lowerRatio: Math.exp(orderInterval.lower),
          upperRatio: Math.exp(orderInterval.upper),
        },
      };
    }
    const oursFirst = byOrder['ours-first'].ratios;
    const referenceFirst = byOrder['reference-first'].ratios;
    const pairedOrderLogs = oursFirst.map((ratio, index) =>
      Math.log(referenceFirst[index] / ratio)
    );
    const orderEffect = ordinaryInterval(pairedOrderLogs);
    const bootstrap = bootstrapPairedReplicateInterval(
      replicatePairs.map((pair) => pair.map(Math.log)),
      groupSeed,
      resamples,
      0.95
    );
    result[group] = {
      replicates: ratios.length,
      geometricMeanPairedRuntimeRatio: Math.exp(ordinary.mean),
      ordinary95: {
        lowerRatio: Math.exp(ordinary.lower),
        upperRatio: Math.exp(ordinary.upper),
      },
      bootstrap95: {
        lowerRatio: Math.exp(bootstrap.lower),
        upperRatio: Math.exp(bootstrap.upper),
        resamples: bootstrap.resamples,
      },
      bootstrap90: (() => {
        const interval = bootstrapPairedReplicateInterval(
          replicatePairs.map((pair) => pair.map(Math.log)),
          (groupSeed ^ 0x9e3779b9) >>> 0,
          resamples,
          0.9
        );
        return {
          lowerRatio: Math.exp(interval.lower),
          upperRatio: Math.exp(interval.upper),
          resamples: interval.resamples,
        };
      })(),
      bootstrapSeed: groupSeed,
      bootstrapMethod: CORPUS_INTERVAL_METHOD,
      byOrder,
      orderEffect: {
        logRatio: orderEffect.mean,
        ratio: Math.exp(orderEffect.mean),
        ordinary95: {
          lowerRatio: Math.exp(orderEffect.lower),
          upperRatio: Math.exp(orderEffect.upper),
        },
      },
      withinProcessBatchVariation: withinProcessVariation(values),
      betweenProcessVariation: variationMetrics(ratios),
      ratios,
      checksums: [
        ...new Set(
          values.flatMap((value) => [
            value.oursChecksum,
            value.referenceChecksum,
          ])
        ),
      ],
    };
  }
  return result;
}

export function corpusGroupDecision(summary, config) {
  const logs = summary.ratios.map(Math.log);
  const sd = variationMetrics(logs).sd;
  const intervalLower = Math.log(summary.bootstrap95.lowerRatio);
  const intervalUpper = Math.log(summary.bootstrap95.upperRatio);
  const estimate = Math.log(summary.geometricMeanPairedRuntimeRatio);
  const intervalHalfWidth = Math.max(
    estimate - intervalLower,
    intervalUpper - estimate
  );
  const targetHalfWidth = Math.log(config.precisionMargin);
  const precisionMet =
    summary.replicates >= config.minimumBlocks &&
    intervalHalfWidth <= targetHalfWidth;
  let statistical = 'inconclusive';
  if (precisionMet && summary.bootstrap95.upperRatio < 1)
    statistical = 'postcss-calc faster';
  else if (precisionMet && summary.bootstrap95.lowerRatio > 1)
    statistical = 'postcss-calc slower';
  let practical = 'inconclusive';
  if (precisionMet) {
    practical =
      summary.bootstrap90.lowerRatio >= 1 / config.equivalenceMargin &&
      summary.bootstrap90.upperRatio <= config.equivalenceMargin
        ? 'equivalent'
        : 'not-equivalent';
  }
  return {
    statistical,
    practical,
    observedLogRatioSd: sd,
    observedStandardDeviation: sd,
    confidenceIntervalWidth: intervalUpper - intervalLower,
    intervalHalfWidth,
    targetHalfWidth,
    minimumBlocks: config.minimumBlocks,
    requestedBlocks: config.requestedBlocks,
    observedBlocks: summary.replicates,
    precisionTargetMet: precisionMet,
  };
}

export function analyzeCorpusObservations({
  groups,
  replicates,
  config,
  seed,
}) {
  const decisions = Object.fromEntries(
    Object.entries(groups).map(([group, summary]) => [
      group,
      corpusGroupDecision(summary, config),
    ])
  );
  const exactDecision = decisions.exact;
  const orderDiagnostic =
    Math.abs(groups.exact.orderEffect.logRatio) >
    config.orderInteractionThreshold;
  const status = orderDiagnostic ? 'inconclusive' : exactDecision.statistical;
  const practicalStatus = orderDiagnostic
    ? 'inconclusive'
    : exactDecision.practical;
  return {
    status,
    statistical: {
      status,
      intervalMethod: config.intervalMethod,
      confidence: 0.95,
      equivalenceComparison: 'superiority-on-fixed-corpus',
    },
    practical: {
      status: practicalStatus,
      margin: config.equivalenceMargin,
      interpretation:
        practicalStatus === 'equivalent'
          ? 'within declared margin, not identical'
          : practicalStatus,
      intervalMethod: config.intervalMethod,
      confidence: 0.9,
    },
    decisions,
    orderEffect: groups.exact.orderEffect,
    diagnostics: {
      orderInteraction: orderDiagnostic,
      orderInteractionThreshold: config.orderInteractionThreshold,
      replicates: replicates.length,
      seed,
    },
  };
}

/** Recompute corpus decisions from retained raw benchmark observations. */
export function analyzeCorpus(artifact) {
  if (!artifact || artifact.benchmark !== 'corpus')
    throw new TypeError('expected a corpus artifact');
  if (artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION)
    validateSchemaV2Artifact(artifact);
  const config = decisionConfigForArtifact(artifact, 'corpus');
  const groups = groupResults(
    artifact.replicates,
    artifact.seed,
    config.bootstrapResamples
  );
  const result = {
    ...analyzeCorpusObservations({
      groups,
      replicates: artifact.replicates,
      config,
      seed: artifact.seed,
    }),
    aggregate: groups.exact,
    groups,
  };
  if (
    artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION &&
    artifact.analysis
  )
    assertStoredAnalysisMatches(artifact.analysis, result);
  return result;
}

function assertStoredAnalysisMatches(stored, expected, path = 'analysis') {
  if (
    !stored ||
    typeof stored !== 'object' ||
    Array.isArray(stored) ||
    !expected ||
    typeof expected !== 'object' ||
    Array.isArray(expected)
  )
    throw new TypeError(`${path} is not a statistical summary object`);
  const storedKeys = Object.keys(stored).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (JSON.stringify(storedKeys) !== JSON.stringify(expectedKeys))
    throw new TypeError(`${path} does not match recomputed observations`);
  for (const key of expectedKeys) {
    const left = stored[key];
    const right = expected[key];
    if (typeof right === 'number') {
      if (
        typeof left !== 'number' ||
        !Number.isFinite(left) ||
        Math.abs(left - right) > 1e-10 * Math.max(1, Math.abs(right))
      )
        throw new TypeError(
          `${path}.${key} does not match recomputed observations`
        );
    } else if (Array.isArray(right)) {
      if (!Array.isArray(left) || left.length !== right.length)
        throw new TypeError(
          `${path}.${key} does not match recomputed observations`
        );
      for (let index = 0; index < right.length; index++)
        assertStoredValue(
          left[index],
          right[index],
          `${path}.${key}[${index}]`
        );
    } else if (right && typeof right === 'object') {
      assertStoredAnalysisMatches(left, right, `${path}.${key}`);
    } else if (left !== right) {
      throw new TypeError(
        `${path}.${key} does not match recomputed observations`
      );
    }
  }
}

function assertStoredValue(left, right, path) {
  if (typeof right === 'number') {
    if (
      typeof left !== 'number' ||
      !Number.isFinite(left) ||
      Math.abs(left - right) > 1e-10 * Math.max(1, Math.abs(right))
    )
      throw new TypeError(`${path} does not match recomputed observations`);
  } else if (Array.isArray(right)) {
    if (!Array.isArray(left) || left.length !== right.length)
      throw new TypeError(`${path} does not match recomputed observations`);
    for (let index = 0; index < right.length; index++)
      assertStoredValue(left[index], right[index], `${path}[${index}]`);
  } else if (right && typeof right === 'object') {
    assertStoredAnalysisMatches(left, right, path);
  } else if (left !== right) {
    throw new TypeError(`${path} does not match recomputed observations`);
  }
}

function withinProcessVariation(values) {
  const normalized = [];
  const byReplicate = new Map();
  for (const value of values) {
    const current = byReplicate.get(value.replicate) ?? {
      ours: [],
      reference: [],
    };
    current.ours.push(value.ours);
    current.reference.push(value.reference);
    byReplicate.set(value.replicate, current);
  }
  for (const value of byReplicate.values()) {
    const oursCenter = median(value.ours);
    const referenceCenter = median(value.reference);
    normalized.push(
      ...value.ours.map((sample) => sample / oursCenter),
      ...value.reference.map((sample) => sample / referenceCenter)
    );
  }
  return variationMetrics(normalized).relativeSpan;
}
