/* oxlint-disable complexity */
export const TARGET_BATCH_MS = 25;
export const MIN_WARMUPS = 5;
export const MAX_WARMUPS = 10;
export const MEASURED_BATCHES = 6;
export const DRIFT_THRESHOLD = 0.15;
export const BOOTSTRAP_RESAMPLES = 100_000;
export const NON_REGRESSION_MARGIN = 1.1;
export const CORPUS_EQUIVALENCE_MARGIN = 1.1;
export const GROWTH_THRESHOLD = 2.5;
export const MIN_VALID_BLOCKS = 20;
export const DECISION_CONFIG_VERSION = 3;
export const PRECISION_METHOD = 'family-adjusted-interval-width';
export const DECISION_INTERVAL_METHOD =
  'stratified-max-t-studentized-bootstrap';
export const CORPUS_INTERVAL_METHOD =
  'paired-replicate-order-log-ratio-bootstrap';

// These are the fields that determine the interpretation of a schema-v2
// artifact.  Keep this list here rather than duplicating it in the parser and
// corpus analyzers: a reanalysis must have one authoritative contract.
export const DECISION_CONFIG_KEYS = [
  'decisionConfigVersion',
  'requestedBlocks',
  'minimumBlocks',
  'maxAttempts',
  'targetBatchMs',
  'warmupMinimum',
  'warmupMaximum',
  'measuredBatchCount',
  'driftThreshold',
  'bootstrapResamples',
  'confidence',
  'runtimeNonRegressionMargin',
  'equivalenceMargin',
  'precisionMargin',
  'growthThreshold',
  'orderInteractionThreshold',
  'precisionMethod',
  'intervalMethod',
];

/** @param {object} config @param {string} kind */
export function validateDecisionConfig(config, kind = 'artifact') {
  if (!config || typeof config !== 'object')
    throw new TypeError(`${kind} is missing decision configuration`);
  for (const key of DECISION_CONFIG_KEYS)
    if (!Object.hasOwn(config, key))
      throw new TypeError(`${kind} is missing decision parameter ${key}`);
  if (config.decisionConfigVersion !== DECISION_CONFIG_VERSION)
    throw new TypeError(
      `${kind} has an invalid decision configuration version`
    );
  for (const key of [
    'requestedBlocks',
    'minimumBlocks',
    'maxAttempts',
    'measuredBatchCount',
    'bootstrapResamples',
  ])
    if (!Number.isInteger(config[key]) || config[key] <= 0)
      throw new TypeError(`${kind} has invalid decision parameter ${key}`);
  if (config.requestedBlocks < config.minimumBlocks)
    throw new TypeError(`${kind} has an invalid requested block count`);
  if (config.maxAttempts < config.requestedBlocks)
    throw new TypeError(`${kind} has an invalid maxAttempts`);
  for (const key of ['warmupMinimum', 'warmupMaximum'])
    if (!Number.isInteger(config[key]) || config[key] < 0)
      throw new TypeError(`${kind} has invalid decision parameter ${key}`);
  if (config.warmupMaximum < config.warmupMinimum)
    throw new TypeError(`${kind} has an invalid warm-up range`);
  for (const key of [
    'targetBatchMs',
    'driftThreshold',
    'bootstrapResamples',
    'runtimeNonRegressionMargin',
    'equivalenceMargin',
    'precisionMargin',
    'growthThreshold',
    'orderInteractionThreshold',
  ])
    if (
      typeof config[key] !== 'number' ||
      !Number.isFinite(config[key]) ||
      config[key] <= 0
    )
      throw new TypeError(`${kind} has invalid decision parameter ${key}`);
  if (
    typeof config.confidence !== 'number' ||
    !Number.isFinite(config.confidence) ||
    config.confidence <= 0 ||
    config.confidence >= 1
  )
    throw new TypeError(`${kind} has invalid decision parameter confidence`);
  if (config.runtimeNonRegressionMargin < 1 || config.equivalenceMargin < 1)
    throw new TypeError(`${kind} has an invalid ratio margin`);
  if (config.precisionMargin < 1 || config.growthThreshold <= 1)
    throw new TypeError(`${kind} has an invalid precision or growth margin`);
  if (
    ![DECISION_INTERVAL_METHOD, CORPUS_INTERVAL_METHOD].includes(
      config.intervalMethod
    )
  )
    throw new TypeError(`${kind} has an invalid interval method`);
  if (config.precisionMethod !== PRECISION_METHOD)
    throw new TypeError(`${kind} has an invalid precision method`);
  return config;
}

/**
 * Migrate the pre-contract artifacts that were emitted by the first schema-v2
 * implementation.  This is intentionally the only place where repository
 * defaults are applied. New artifacts must carry decisionConfigVersion: 3.
 */
export function migrateLegacyDecisionConfig(
  artifact,
  kind = artifact?.benchmark === 'corpus' ? 'corpus' : 'parser'
) {
  const source = artifact?.config ?? {};
  const blocks = artifact?.blocks?.length ?? artifact?.replicates?.length ?? 0;
  const requestedBlocks =
    source.requestedBlocks ?? source.blocks ?? source.replicates ?? blocks;
  const base = {
    decisionConfigVersion: DECISION_CONFIG_VERSION,
    requestedBlocks,
    minimumBlocks: source.minimumBlocks ?? MIN_VALID_BLOCKS,
    maxAttempts: source.maxAttempts ?? Math.max(30, requestedBlocks),
    targetBatchMs: source.targetBatchMs ?? TARGET_BATCH_MS,
    warmupMinimum:
      source.warmupMinimum ?? (kind === 'corpus' ? 0 : MIN_WARMUPS),
    warmupMaximum:
      source.warmupMaximum ?? (kind === 'corpus' ? 0 : MAX_WARMUPS),
    measuredBatchCount:
      source.measuredBatchCount ?? source.batches ?? MEASURED_BATCHES,
    driftThreshold: source.driftThreshold ?? DRIFT_THRESHOLD,
    bootstrapResamples: source.bootstrapResamples ?? BOOTSTRAP_RESAMPLES,
    confidence: source.confidence ?? 0.95,
    runtimeNonRegressionMargin:
      source.runtimeNonRegressionMargin ?? NON_REGRESSION_MARGIN,
    equivalenceMargin:
      source.equivalenceMargin ??
      (kind === 'corpus' ? CORPUS_EQUIVALENCE_MARGIN : 1.1),
    precisionMargin: source.precisionMargin ?? 1.1,
    precisionMethod: PRECISION_METHOD,
    growthThreshold: source.growthThreshold ?? GROWTH_THRESHOLD,
    orderInteractionThreshold:
      source.orderInteractionThreshold ?? Math.log(1.1),
    intervalMethod:
      source.intervalMethod ??
      (kind === 'corpus' ? CORPUS_INTERVAL_METHOD : DECISION_INTERVAL_METHOD),
  };
  if (kind === 'corpus')
    return {
      ...base,
      replicates: source.replicates ?? blocks,
      batches: source.batches ?? 6,
      calibrationOrderBalanced: source.calibrationOrderBalanced ?? false,
    };
  return base;
}

/** @param {object} artifact @param {string} kind @return {object} */
export function decisionConfigForArtifact(artifact, kind) {
  if (artifact?.config?.decisionConfigVersion === DECISION_CONFIG_VERSION)
    return validateDecisionConfig(artifact.config, `${kind} artifact`);
  if (artifact?.config?.decisionConfigVersion !== undefined)
    throw new TypeError(
      `${kind} artifact has an invalid decision configuration version`
    );
  return validateDecisionConfig(
    migrateLegacyDecisionConfig(artifact, kind),
    `${kind} legacy artifact`
  );
}
