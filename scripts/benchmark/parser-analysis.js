/* oxlint-disable no-bitwise */
import {
  bootstrapStratifiedMaxT,
  decisionConfigForArtifact,
  DECISION_INTERVAL_METHOD,
  MIN_VALID_BLOCKS,
  validateSchemaV2Artifact,
} from './benchmark.js';
import {
  analyzeSlopes,
  addSlopeIntervals,
  analyzeGrowth,
  addGrowthIntervals,
  largestSizeKeys,
} from './parser-scaling.js';
import {
  applyFamilyBootstrap,
  initialEndpoint,
  pairedLogRatios,
  processOrderEffect,
} from './parser-analysis-endpoints.js';
import {
  applyPrecision,
  combineStatuses,
  growthVerdict,
  verdict,
} from './parser-analysis-verdicts.js';

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
