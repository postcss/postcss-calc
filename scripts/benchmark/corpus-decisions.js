import { variationMetrics } from './benchmark.js';

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
