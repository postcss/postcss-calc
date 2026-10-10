import {
  logRatio,
  median,
  ordinaryInterval,
  variationMetrics,
} from './benchmark.js';
import { bootstrapRatioSummary, precisionSummary } from './parser-scaling.js';

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

export function pairedLogRatios(blocks, keys) {
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

export function initialEndpoint(blocks, key, logs) {
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

export function applyFamilyBootstrap(
  endpoints,
  familyBootstrap,
  config,
  blockCount
) {
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

export function processOrderEffect(endpoints, threshold) {
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
