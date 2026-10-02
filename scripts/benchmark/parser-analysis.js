/* oxlint-disable no-bitwise */
import {
  bootstrapStratifiedMaxT,
  decisionConfigForArtifact,
  DECISION_INTERVAL_METHOD,
  logRatio,
  median,
  MIN_VALID_BLOCKS,
  ordinaryInterval,
  variationMetrics,
  validateSchemaV2Artifact,
} from './benchmark.js';
import {
  analyzeSlopes,
  addSlopeIntervals,
  analyzeGrowth,
  addGrowthIntervals,
  bootstrapRatioSummary,
  largestSizeKeys,
  precisionSummary,
} from './parser-scaling.js';

function revisionResults(blocks, revision) {
  const values = new Map();
  for (const block of blocks) {
    const process = block.revisions.find((item) => item.revision === revision);
    for (const workload of process.workloads) {
      const list = values.get(workload.key) ?? [];
      list.push(median(workload.measured));
      values.set(workload.key, list);
    }
  }
  return values;
}

function pairedLogRatios(blocks, keys) {
  const baseline = revisionResults(blocks, 'baseline');
  const candidate = revisionResults(blocks, 'candidate');
  return keys.map((key) => {
    const base = baseline.get(key);
    const cand = candidate.get(key);
    if (
      !base ||
      !cand ||
      base.length !== blocks.length ||
      cand.length !== blocks.length
    )
      throw new TypeError(`missing paired observations for ${key}`);
    return cand.map((value, index) => logRatio(value, base[index]));
  });
}

function initialEndpoint(blocks, key, logs) {
  const ordinary = ordinaryInterval(logs);
  const endpoint = {
    key,
    geometricMeanPairedRuntimeRatio: Math.exp(ordinary.mean),
    logRatio: ordinary.mean,
    ordinary95: {
      lowerRatio: Math.exp(ordinary.lower),
      upperRatio: Math.exp(ordinary.upper),
    },
    oneSided95: {
      lowerRatio: null,
      upperRatio: null,
    },
    baselineVariation: variationFor(blocks, 'baseline', key),
    candidateVariation: variationFor(blocks, 'candidate', key),
    betweenProcessVariation: {
      pairedRatio: variationMetrics(logs.map(Math.exp)),
    },
    withinProcessBatchVariation: batchVariation(blocks, key),
    byProcessOrder: processOrderSummaries(blocks, logs, key),
    meaningfulImprovement: null,
    ratios: logs.map(Math.exp),
  };
  endpoint.observedLogRatioSd = variationMetrics(logs).sd;
  return endpoint;
}

function applyFamilyBootstrap(endpoints, familyBootstrap, config, blockCount) {
  for (const [index, endpoint] of endpoints.entries()) {
    endpoint.logRatio = familyBootstrap.observed[index];
    endpoint.geometricMeanPairedRuntimeRatio = Math.exp(endpoint.logRatio);
    const half = 1.96 * familyBootstrap.standardErrors[index];
    endpoint.ordinary95 = {
      lowerRatio: Math.exp(endpoint.logRatio - half),
      upperRatio: Math.exp(endpoint.logRatio + half),
    };
    addRuntimeIntervals(
      endpoint,
      familyBootstrap.intervals[index],
      familyBootstrap,
      config,
      blockCount,
      index
    );
  }
}

function growthVerdict(growth, threshold) {
  let status = 'pass';
  if (growth.some((item) => item.candidateLowerRatio > threshold))
    status = 'regression';
  else if (growth.some((item) => item.candidateUpperRatio > threshold))
    status = 'inconclusive';
  return applyPrecision(status, growth);
}

function combineStatuses(runtimeStatus, slopeStatus, growthStatus) {
  const statuses = [runtimeStatus, slopeStatus, growthStatus];
  if (statuses.includes('regression')) return 'regression';
  if (statuses.every((item) => item === 'pass')) return 'pass';
  return 'inconclusive';
}

function addSensitivity(result, artifact, blocks) {
  const structurallyValid = Array.isArray(artifact.attempts)
    ? artifact.attempts.filter(
        (attempt) => attempt.structuralMismatches.length === 0
      )
    : blocks;
  const orderCounts = new Set(
    structurallyValid.map((attempt) => attempt.processOrder)
  );
  if (structurallyValid.length >= MIN_VALID_BLOCKS && orderCounts.size === 2) {
    result.sensitivity = analyzeParser(
      { ...artifact, blocks: structurallyValid, analysis: undefined },
      { skipValidation: true, sensitivity: false }
    );
  } else {
    result.sensitivity = {
      status: 'inconclusive',
      validBlocks: structurallyValid.length,
      reason: `fewer than ${MIN_VALID_BLOCKS} structurally valid blocks`,
    };
  }
  result.diagnostics = {
    ...result.diagnostics,
    rejectedAttempts: Array.isArray(artifact.attempts)
      ? artifact.attempts.length - blocks.length
      : 0,
    structurallyValidAttempts: structurallyValid.length,
    primaryAndSensitivityDisagree: result.status !== result.sensitivity.status,
  };
  if (result.diagnostics.primaryAndSensitivityDisagree)
    result.status = 'inconclusive';
}

export function analyzeParser(
  artifact,
  { skipValidation = false, sensitivity = true } = {}
) {
  if (!skipValidation) validateSchemaV2Artifact(artifact);
  const blocks = artifact.blocks;
  const config = decisionConfigForArtifact(artifact, 'parser');
  if (artifact.analysis?.status === 'correctness-failure')
    return artifact.analysis;
  if (blocks.length < MIN_VALID_BLOCKS)
    return {
      status: 'inconclusive',
      validBlocks: blocks.length,
      reason: `fewer than ${MIN_VALID_BLOCKS} valid blocks`,
    };
  const keys = artifact.workloadKeys;
  const logsByKey = pairedLogRatios(blocks, keys);
  const runtimeRows = blocks.map((_, index) =>
    logsByKey.map((values) => values[index])
  );
  const endpoints = keys.map((key, index) =>
    initialEndpoint(blocks, key, logsByKey[index])
  );

  const largestKeys = largestSizeKeys(artifact.workloadKeys);
  const largest = endpoints.filter((endpoint) => largestKeys.has(endpoint.key));
  const slopes = analyzeSlopes(artifact, blocks, config);
  const growthData = analyzeGrowth(artifact, blocks);
  const familyRows = blocks.map((_, index) => [
    ...runtimeRows[index],
    ...slopes.claimRows.map((values) => values[index]),
    ...growthData.claimRows.map((values) => values[index]),
  ]);
  const familyBootstrap = bootstrapStratifiedMaxT({
    rows: familyRows,
    strata: blocks.map((block) => block.processOrder),
    seed: (artifact.seed ^ 0x6a09e667) >>> 0,
    resamples: config.bootstrapResamples,
    confidence: config.confidence,
  });
  applyFamilyBootstrap(endpoints, familyBootstrap, config, blocks.length);
  addSlopeIntervals(slopes, familyBootstrap, keys.length, config);
  const growth = addGrowthIntervals(
    growthData,
    familyBootstrap,
    keys.length + slopes.claimRows.length,
    blocks,
    config
  );
  const orderEffect = processOrderEffect(
    endpoints,
    config.orderInteractionThreshold
  );
  const runtimeStatus = applyPrecision(
    verdict(largest, config.runtimeNonRegressionMargin),
    largest
  );
  const slopeStatus = applyPrecision(
    verdict(
      slopes.endpoints,
      Math.log2(config.runtimeNonRegressionMargin),
      true
    ),
    slopes.endpoints
  );
  const growthStatus = growthVerdict(growth, config.growthThreshold);
  let status = combineStatuses(runtimeStatus, slopeStatus, growthStatus);
  if (orderEffect.diagnostic) status = 'inconclusive';
  const rejections = rejectionSummary(artifact.attempts);
  const result = {
    status,
    intervalMethod: DECISION_INTERVAL_METHOD,
    runtimeStatus,
    slopeStatus,
    growthStatus,
    endpoints,
    slopes,
    growth,
    orderEffect,
    rejections,
    rejectionCounts: rejections.byReason,
    rejectionRate: rejections.rate,
    observedBlocks: blocks.length,
    validBlocks: blocks.length,
  };
  if (sensitivity) addSensitivity(result, artifact, blocks);
  return result;
}

function rejectionSummary(attempts) {
  if (!Array.isArray(attempts))
    return { attempts: 0, accepted: 0, rejected: 0, byReason: {}, rate: 0 };
  const byReason = {};
  for (const attempt of attempts)
    for (const reason of attempt.rejectionReasons ?? [])
      byReason[reason] = (byReason[reason] ?? 0) + 1;
  const rejected = attempts.filter((attempt) => attempt.rejected).length;
  return {
    attempts: attempts.length,
    accepted: attempts.length - rejected,
    rejected,
    byReason,
    rate: rejected / attempts.length,
  };
}

function processOrderSummaries(blocks, logs, key) {
  const summaries = {};
  for (const order of ['baseline-first', 'candidate-first']) {
    const values = logs.filter(
      (_, index) => blocks[index].processOrder === order
    );
    const interval = ordinaryInterval(values);
    summaries[order] = {
      replicates: values.length,
      key,
      geometricMeanPairedRuntimeRatio: Math.exp(interval.mean),
      ordinary95: {
        lowerRatio: Math.exp(interval.lower),
        upperRatio: Math.exp(interval.upper),
      },
      ratios: values.map(Math.exp),
    };
  }
  return summaries;
}

function processOrderEffect(endpoints, threshold) {
  const effects = endpoints.map((endpoint) => {
    const baseline = endpoint.byProcessOrder['baseline-first'].ratios;
    const candidate = endpoint.byProcessOrder['candidate-first'].ratios;
    const baselineMean = ordinaryInterval(baseline.map(Math.log));
    const candidateMean = ordinaryInterval(candidate.map(Math.log));
    const orderLogRatio = candidateMean.mean - baselineMean.mean;
    const standardError = Math.sqrt(
      baselineMean.sd ** 2 / baseline.length +
        candidateMean.sd ** 2 / candidate.length
    );
    const half = 1.96 * standardError;
    return {
      key: endpoint.key,
      logRatio: orderLogRatio,
      ratio: Math.exp(orderLogRatio),
      standardError,
      ordinary95: {
        lowerRatio: Math.exp(orderLogRatio - half),
        upperRatio: Math.exp(orderLogRatio + half),
      },
    };
  });
  return {
    threshold,
    endpoints: effects,
    diagnostic: effects.some((effect) => Math.abs(effect.logRatio) > threshold),
  };
}

function addRuntimeIntervals(
  endpoint,
  intervals,
  bootstrap,
  config,
  blocks,
  index
) {
  endpoint.oneSided95 = {
    lowerRatio: Math.exp(intervals.oneSidedLower),
    upperRatio: Math.exp(intervals.oneSidedUpper),
  };
  endpoint.familyAdjusted95 = {
    lowerRatio: Math.exp(intervals.familyLower),
    upperRatio: Math.exp(intervals.familyUpper),
  };
  endpoint.meaningfulImprovement = intervals.upper <= Math.log(0.9);
  endpoint.bootstrap95 = bootstrapRatioSummary(intervals, bootstrap);
  endpoint.precision = precisionSummary(
    endpoint.observedLogRatioSd,
    bootstrap.standardErrors[index],
    config,
    intervals.familyLower,
    intervals.familyUpper,
    endpoint.logRatio,
    Math.log(config.precisionMargin),
    blocks
  );
}

function variationFor(blocks, revision, key) {
  const values = blocks.map((block) =>
    median(
      block.revisions
        .find((item) => item.revision === revision)
        .workloads.find((item) => item.key === key).measured
    )
  );
  return { ...variationMetrics(values), observations: values };
}

function batchVariation(blocks, key) {
  const values = [];
  for (const block of blocks)
    for (const revision of block.revisions) {
      const workload = revision.workloads.find((item) => item.key === key);
      const center = median(workload.measured);
      values.push(...workload.measured.map((value) => value / center));
    }
  return { ...variationMetrics(values), observations: values };
}

function applyPrecision(status, endpoints) {
  if (endpoints.length === 0) return status;
  const precise = endpoints.every((endpoint) => endpoint.precision?.targetMet);
  if (precise) return status;
  return 'inconclusive';
}

function verdict(endpoints, margin, slope = false) {
  if (
    endpoints.some(
      (endpoint) =>
        (slope
          ? endpoint.familyAdjusted95.lower
          : endpoint.familyAdjusted95.lowerRatio) > margin
    )
  )
    return 'regression';
  if (
    endpoints.every(
      (endpoint) =>
        (slope ? endpoint.oneSided95.upper : endpoint.oneSided95.upperRatio) <=
        margin
    )
  )
    return 'pass';
  return 'inconclusive';
}
