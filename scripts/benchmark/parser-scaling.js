import { linearRegression, median, variationMetrics } from './benchmark.js';

export function precisionSummary(
  observedStandardDeviation,
  standardError,
  config,
  lower,
  upper,
  estimate,
  targetHalfWidth,
  observedBlocks
) {
  const intervalHalfWidth = Math.max(estimate - lower, upper - estimate);
  return {
    observedStandardDeviation,
    standardError,
    confidenceIntervalWidth: upper - lower,
    intervalHalfWidth,
    targetHalfWidth,
    minimumBlocks: config.minimumBlocks,
    requestedBlocks: config.requestedBlocks,
    observedBlocks,
    targetMet:
      observedBlocks >= config.minimumBlocks &&
      intervalHalfWidth <= targetHalfWidth,
  };
}

export function parseKey(key) {
  const parts = key.split(':');
  const size = Number(parts.at(-1));
  if (parts.length === 3) return { key, shape: parts[0], mode: parts[1], size };
  return { key, shape: 'nested-fallbacks', mode: parts[0], size };
}

export function largestSizeKeys(workloadKeys) {
  const maximum = new Map();
  for (const key of workloadKeys) {
    const { shape, mode, size } = parseKey(key);
    const group = `${shape}:${mode}`;
    maximum.set(group, Math.max(maximum.get(group) ?? 0, size));
  }
  return new Set([...maximum].map(([group, size]) => `${group}:${size}`));
}

export function findWorkload(block, revision, key) {
  return block.revisions
    .find((item) => item.revision === revision)
    .workloads.find((item) => item.key === key);
}

export function analyzeSlopes(artifact, blocks, config) {
  const workloads = artifact.workloadKeys
    .map((key) => parseKey(key))
    .filter((item) => item.size);
  const groups = new Map();
  for (const item of workloads) {
    const group = `${item.shape}:${item.mode}`;
    const values = groups.get(group) ?? {
      shape: item.shape,
      mode: item.mode,
      sizes: [],
    };
    values.sizes.push(item.size);
    groups.set(group, values);
  }
  const raw = [];
  for (const group of groups.values()) {
    const deltas = [];
    const baseSlopes = [];
    const candidateSlopes = [];
    for (const block of blocks) {
      const base = group.sizes.map((size) =>
        median(
          findWorkload(
            block,
            'baseline',
            `${group.shape}:${group.mode}:${size}`
          ).measured
        )
      );
      const cand = group.sizes.map((size) =>
        median(
          findWorkload(
            block,
            'candidate',
            `${group.shape}:${group.mode}:${size}`
          ).measured
        )
      );
      const x = group.sizes.map(Math.log);
      const b = linearRegression(x, base.map(Math.log));
      const c = linearRegression(x, cand.map(Math.log));
      baseSlopes.push(b.beta);
      candidateSlopes.push(c.beta);
      deltas.push(c.beta - b.beta);
    }
    raw.push({
      key: `${group.shape}:${group.mode}`,
      baselineSlope: median(baseSlopes),
      candidateSlope: median(candidateSlopes),
      baselineSlopes: baseSlopes,
      candidateSlopes,
      deltas,
    });
  }
  return {
    permittedIncrease: Math.log2(config.runtimeNonRegressionMargin),
    endpoints: raw,
    claimRows: raw.map((item) => item.deltas),
  };
}

export function addSlopeIntervals(slopes, bootstrap, offset, config) {
  slopes.endpoints = slopes.endpoints.map((item, index) => {
    const intervals = bootstrap.intervals[offset + index];
    const standardError = bootstrap.standardErrors[offset + index];
    return {
      ...item,
      deltaSlope: bootstrap.observed[offset + index],
      ordinary95: {
        lower:
          bootstrap.observed[offset + index] -
          1.96 * bootstrap.standardErrors[offset + index],
        upper:
          bootstrap.observed[offset + index] +
          1.96 * bootstrap.standardErrors[offset + index],
      },
      oneSided95: {
        lower: intervals.oneSidedLower,
        upper: intervals.oneSidedUpper,
      },
      familyAdjusted95: {
        lower: intervals.familyLower,
        upper: intervals.familyUpper,
      },
      bootstrap95: {
        lower: intervals.lower,
        upper: intervals.upper,
        resamples: bootstrap.resamples,
        familyCount: bootstrap.familyCount,
        degenerateResamples: bootstrap.degenerateResamples,
        degenerateFallbacks: bootstrap.degenerateFallbacks,
      },
      precision: precisionSummary(
        variationMetrics(item.deltas).sd,
        standardError,
        config,
        intervals.familyLower,
        intervals.familyUpper,
        bootstrap.observed[offset + index],
        Math.log2(config.precisionMargin),
        item.deltas.length
      ),
    };
  });
}

export function analyzeGrowth(artifact, blocks) {
  const results = [];
  const logs = [];
  const groups = new Map();
  for (const key of artifact.workloadKeys) {
    const item = parseKey(key);
    const group = `${item.shape}:${item.mode}`;
    const list = groups.get(group) ?? [];
    list.push(item);
    groups.set(group, list);
  }
  for (const [group, items] of groups) {
    items.sort((a, b) => a.size - b.size);
    for (let i = 1; i < items.length; i++) {
      const doublings = Math.log2(items[i].size / items[i - 1].size);
      const base = [];
      const cand = [];
      for (const block of blocks) {
        const baseRatio =
          median(findWorkload(block, 'baseline', items[i].key).measured) /
          median(findWorkload(block, 'baseline', items[i - 1].key).measured);
        const candRatio =
          median(findWorkload(block, 'candidate', items[i].key).measured) /
          median(findWorkload(block, 'candidate', items[i - 1].key).measured);
        base.push(doublings === 1 ? baseRatio : baseRatio ** (1 / doublings));
        cand.push(doublings === 1 ? candRatio : candRatio ** (1 / doublings));
      }
      logs.push(cand.map(Math.log));
      results.push({
        group,
        from: items[i - 1].size,
        to: items[i].size,
        baselineMedian: median(base),
        candidateMedian: median(cand),
      });
    }
  }
  return { results, claimRows: logs };
}

export function addGrowthIntervals(
  growthData,
  bootstrap,
  offset,
  blocks,
  config
) {
  return growthData.results.map((result, index) => {
    const intervals = bootstrap.intervals[offset + index];
    const standardError = bootstrap.standardErrors[offset + index];
    result.candidateLowerRatio = Math.exp(intervals.familyLower);
    result.candidateUpperRatio = Math.exp(intervals.familyUpper);
    result.candidateMedian = Math.exp(bootstrap.observed[offset + index]);
    result.familyAdjusted95 = {
      lower: intervals.familyLower,
      upper: intervals.familyUpper,
      lowerRatio: result.candidateLowerRatio,
      upperRatio: result.candidateUpperRatio,
    };
    result.bootstrap95 = {
      lowerRatio: Math.exp(intervals.lower),
      upperRatio: Math.exp(intervals.upper),
      resamples: bootstrap.resamples,
      familyCount: bootstrap.familyCount,
      degenerateResamples: bootstrap.degenerateResamples,
      degenerateFallbacks: bootstrap.degenerateFallbacks,
    };
    result.precision = precisionSummary(
      variationMetrics(growthData.claimRows[index]).sd,
      standardError,
      config,
      intervals.familyLower,
      intervals.familyUpper,
      bootstrap.observed[offset + index],
      Math.log(config.precisionMargin),
      blocks.length
    );
    return result;
  });
}
