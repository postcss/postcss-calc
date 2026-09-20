/* oxlint-disable no-bitwise, complexity */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  bootstrapStratifiedMaxT,
  collectBenchmarkProvenance,
  decisionConfigForArtifact,
  DECISION_CONFIG_VERSION,
  DECISION_INTERVAL_METHOD,
  DRIFT_THRESHOLD,
  GROWTH_THRESHOLD,
  linearRegression,
  logRatio,
  materializeBaseline,
  median,
  MIN_VALID_BLOCKS,
  NON_REGRESSION_MARGIN,
  PRECISION_METHOD,
  normalizeSeed,
  ordinaryInterval,
  runChild,
  seededShuffle,
  variationMetrics,
  validateSchemaV2Artifact,
} from './benchmark.js';

// Four logarithmically spaced sizes with uniform doubling steps (2x)
// keep the scaling claims (slope and doubling growth) sound and well-powered
// while holding the default 20-block run to under five minutes.
const SIZES = [2_000, 4_000, 8_000, 16_000];
const DEPTHS = [16, 32, 64, 128, 256, 512];
// 16ms batch targets provide ample separation above the timer resolution floor
// while keeping worker durations concise.
const PARSER_TARGET_BATCH_MS = 16;
const PARSER_WARMUP_MINIMUM = 4;
const PARSER_WARMUP_MAXIMUM = 8;
const PARSER_MEASURED_BATCHES = 5;
const SCRIPT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKER = join(SCRIPT_ROOT, 'parser-benchmark-worker.js');

function arithmetic(kind, size) {
  if (kind === 'additive') return Array(size).fill('1').join(' + ');
  if (kind === 'multiplicative') return Array(size).fill('2').join(' * ');
  const operators = [' + ', ' * ', ' - ', ' / '];
  const parts = ['1'];
  for (let i = 1; i < size; i++)
    parts.push(operators[(i - 1) % operators.length], String((i % 7) + 1));
  return parts.join('');
}

function nestedFallback(depth) {
  let value = 'calc(1px + 2px)';
  for (let i = depth; i >= 1; i--) value = `calc(var(--x${i}, ${value}))`;
  return value;
}

export function parserWorkloads(benchmark) {
  const result = [];
  if (benchmark === 'arithmetic-chains') {
    for (const shape of [
      'additive',
      'multiplicative',
      'alternating-precedence',
    ])
      for (const mode of ['cold-index', 'hot-shared-index'])
        for (const size of SIZES)
          result.push({
            key: `${shape}:${mode}:${size}`,
            shape,
            mode,
            size,
            source: arithmetic(shape, size),
          });
  } else if (benchmark === 'nested-fallbacks') {
    for (const mode of ['cold-index', 'hot-shared-index'])
      for (const depth of DEPTHS)
        result.push({
          key: `nested-fallbacks:${mode}:${depth}`,
          shape: 'nested-fallbacks',
          mode,
          size: depth,
          source: nestedFallback(depth),
        });
  } else throw new Error(`unsupported benchmark: ${benchmark}`);
  return result;
}

function endpointKey(workload) {
  return workload.key;
}

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

function analyzeParser(
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
  const baseline = revisionResults(blocks, 'baseline');
  const candidate = revisionResults(blocks, 'candidate');
  const keys = artifact.workloadKeys;
  const logsByKey = keys.map((key) => {
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
  const runtimeRows = blocks.map((_, index) =>
    logsByKey.map((values) => values[index])
  );
  const endpoints = [];
  for (const [keyIndex, key] of keys.entries()) {
    const logs = logsByKey[keyIndex];
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
    const sd = variationMetrics(logs).sd;
    endpoint.observedLogRatioSd = sd;
    endpoints.push(endpoint);
  }

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
      blocks.length,
      index
    );
  }
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
  let growthStatus = 'pass';
  if (growth.some((item) => item.candidateLowerRatio > config.growthThreshold))
    growthStatus = 'regression';
  else if (
    growth.some((item) => item.candidateUpperRatio > config.growthThreshold)
  )
    growthStatus = 'inconclusive';
  growthStatus = applyPrecision(growthStatus, growth);
  let status;
  if (
    runtimeStatus === 'regression' ||
    slopeStatus === 'regression' ||
    growthStatus === 'regression'
  )
    status = 'regression';
  else if (
    runtimeStatus === 'pass' &&
    slopeStatus === 'pass' &&
    growthStatus === 'pass'
  )
    status = 'pass';
  else status = 'inconclusive';
  if (orderEffect.diagnostic) status = 'inconclusive';
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
    rejections: rejectionSummary(artifact.attempts),
    rejectionCounts: rejectionSummary(artifact.attempts).byReason,
    rejectionRate: rejectionSummary(artifact.attempts).rate,
    observedBlocks: blocks.length,
    validBlocks: blocks.length,
  };
  if (sensitivity) {
    const structurallyValid = Array.isArray(artifact.attempts)
      ? artifact.attempts.filter(
          (attempt) => attempt.structuralMismatches.length === 0
        )
      : blocks;
    const orderCounts = new Set(
      structurallyValid.map((attempt) => attempt.processOrder)
    );
    if (
      structurallyValid.length >= MIN_VALID_BLOCKS &&
      orderCounts.size === 2
    ) {
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
      primaryAndSensitivityDisagree:
        result.status !== result.sensitivity.status,
    };
    if (result.diagnostics.primaryAndSensitivityDisagree)
      result.status = 'inconclusive';
  }
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
  endpoint.bootstrap95 = {
    lowerRatio: Math.exp(intervals.lower),
    upperRatio: Math.exp(intervals.upper),
    resamples: bootstrap.resamples,
    familyCount: bootstrap.familyCount,
    degenerateResamples: bootstrap.degenerateResamples,
    degenerateFallbacks: bootstrap.degenerateFallbacks,
  };
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

function precisionSummary(
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

function analyzeSlopes(artifact, blocks, config) {
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

function addSlopeIntervals(slopes, bootstrap, offset, config) {
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

function analyzeGrowth(artifact, blocks) {
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

function addGrowthIntervals(growthData, bootstrap, offset, blocks, config) {
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

function parseKey(key) {
  const parts = key.split(':');
  const size = Number(parts.at(-1));
  if (parts.length === 3) return { key, shape: parts[0], mode: parts[1], size };
  return { key, shape: 'nested-fallbacks', mode: parts[0], size };
}
function largestSizeKeys(workloadKeys) {
  const maximum = new Map();
  for (const key of workloadKeys) {
    const { shape, mode, size } = parseKey(key);
    const group = `${shape}:${mode}`;
    maximum.set(group, Math.max(maximum.get(group) ?? 0, size));
  }
  return new Set([...maximum].map(([group, size]) => `${group}:${size}`));
}

function findWorkload(block, revision, key) {
  return block.revisions
    .find((item) => item.revision === revision)
    .workloads.find((item) => item.key === key);
}

export function runParserBenchmark({
  root = process.cwd(),
  benchmark = 'arithmetic-chains',
  baseline = 'HEAD',
  blocks = MIN_VALID_BLOCKS,
  maxAttempts = Math.max(30, blocks),
  seed = 0x51f15eed,
  output,
} = {}) {
  if (
    !Number.isInteger(blocks) ||
    blocks < MIN_VALID_BLOCKS ||
    blocks % 2 !== 0
  )
    throw new TypeError(
      `--blocks must be an even integer of at least ${MIN_VALID_BLOCKS}`
    );
  if (!Number.isInteger(maxAttempts) || maxAttempts < blocks)
    throw new TypeError('--max-attempts must be an integer at least --blocks');
  const normalizedSeed = normalizeSeed(seed);
  const workloads = parserWorkloads(benchmark);
  const workloadKeys = workloads.map((item) => item.key);
  const config = {
    decisionConfigVersion: DECISION_CONFIG_VERSION,
    benchmark,
    baseline,
    requestedBlocks: blocks,
    minimumBlocks: MIN_VALID_BLOCKS,
    maxAttempts,
    targetBatchMs: PARSER_TARGET_BATCH_MS,
    warmupMinimum: PARSER_WARMUP_MINIMUM,
    warmupMaximum: PARSER_WARMUP_MAXIMUM,
    measuredBatchCount: PARSER_MEASURED_BATCHES,
    driftThreshold: DRIFT_THRESHOLD,
    bootstrapResamples: 100_000,
    confidence: 0.95,
    runtimeNonRegressionMargin: NON_REGRESSION_MARGIN,
    equivalenceMargin: 1.1,
    precisionMargin: 1.1,
    precisionMethod: PRECISION_METHOD,
    growthThreshold: GROWTH_THRESHOLD,
    orderInteractionThreshold: Math.log(1.1),
    intervalMethod: DECISION_INTERVAL_METHOD,
  };
  const environment = collectBenchmarkProvenance(root, {
    baselineRef: baseline,
    benchmark: `parser-${benchmark}`,
    command: process.argv.join(' '),
  });
  const materialized = materializeBaseline(root, baseline);
  try {
    const attempts = [];
    const validBlocks = [];
    const processSchedule = seededShuffle(
      Array.from({ length: blocks }, (_, index) =>
        index < blocks / 2 ? 'baseline-first' : 'candidate-first'
      ),
      normalizedSeed
    );
    let correctnessFailure = null;
    let attempt = 0;
    while (validBlocks.length < blocks && attempt < maxAttempts) {
      const blockSeed =
        (normalizedSeed + Math.imul(attempt + 1, 0x9e3779b9)) >>> 0;
      const order = seededShuffle(workloads, blockSeed);
      // Rejected attempts retry the same acceptance slot. This preserves the
      // randomized, balanced process-order schedule among retained blocks.
      const processOrder = processSchedule[validBlocks.length];
      const revisions = [];
      const sources =
        processOrder === 'baseline-first'
          ? [
              ['baseline', materialized.sourceRoot],
              ['candidate', join(root, 'src')],
            ]
          : [
              ['candidate', join(root, 'src')],
              ['baseline', materialized.sourceRoot],
            ];
      for (const [revision, sourceRoot] of sources) {
        const child = runChild(
          WORKER,
          {
            sourceRoot,
            revision,
            processOrder,
            workloads: order,
            targetBatchMs: config.targetBatchMs,
            warmupMinimum: config.warmupMinimum,
            warmupMaximum: config.warmupMaximum,
            measuredBatchCount: config.measuredBatchCount,
          },
          root
        );
        revisions.push(child);
      }
      const drift = revisions.map((revision) =>
        Math.abs(
          controlMedian(revision.controlAfter) /
            controlMedian(revision.controlBefore) -
            1
        )
      );
      const structural = new Map(
        revisions.flatMap((revision) =>
          revision.workloads.map((workload) => [
            `${revision.revision}:${workload.key}`,
            workload.structural,
          ])
        )
      );
      const mismatches = workloadKeys.filter(
        (key) =>
          structural.get(`baseline:${key}`) !==
          structural.get(`candidate:${key}`)
      );
      const rejected =
        drift.some((value) => value > config.driftThreshold) ||
        mismatches.length > 0;
      const rejectionReasons = [
        ...(drift.some((value) => value > config.driftThreshold)
          ? ['drift']
          : []),
        ...(mismatches.length > 0 ? ['structural-mismatch'] : []),
      ];
      const record = {
        index: attempt,
        seed: blockSeed,
        processOrder,
        workloadOrder: order.map(endpointKey),
        rejected,
        rejectionReasons,
        rejectionReason: rejectionReasons.join('+') || null,
        drift,
        structuralMismatches: mismatches,
        revisions,
      };
      attempts.push(record);
      if (mismatches.length > 0) {
        correctnessFailure = record;
        break;
      }
      if (!rejected) validBlocks.push(record);
      attempt++;
    }
    const artifact = {
      schema: 2,
      benchmark: `parser-${benchmark}`,
      seed: normalizedSeed,
      config,
      environment,
      workloadKeys,
      workloads: workloads.map((workload) =>
        Object.fromEntries(
          Object.entries(workload).filter(([key]) => key !== 'source')
        )
      ),
      attempts,
      blocks: validBlocks,
    };
    if (correctnessFailure) {
      artifact.analysis = {
        status: 'correctness-failure',
        validBlocks: validBlocks.length,
        reason: 'baseline and candidate parser structures differ',
        attempt: correctnessFailure.index,
        structuralMismatches: correctnessFailure.structuralMismatches,
      };
    } else if (validBlocks.length >= MIN_VALID_BLOCKS) {
      artifact.analysis = analyzeParser(artifact);
    } else {
      artifact.analysis = {
        status: 'inconclusive',
        validBlocks: validBlocks.length,
        reason: 'fewer than twenty valid blocks',
      };
    }
    validateSchemaV2Artifact(artifact);
    const path = output
      ? resolve(root, output)
      : join(
          root,
          'reports/benchmarks',
          `${benchmark}-${Date.now()}-${normalizedSeed}.json`
        );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
    if (correctnessFailure)
      throw new Error(
        `parser structural mismatch in attempt ${correctnessFailure.index}: ${correctnessFailure.structuralMismatches.join(', ')}`
      );
    return { artifact, path };
  } finally {
    materialized.cleanup();
  }
}

function controlMedian(control) {
  return typeof control === 'number' ? control : control.medianMs;
}

export { analyzeParser, SIZES, DEPTHS };
