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

function isPositiveFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function requireParameters(config, kind, keys, isValid) {
  for (const key of keys)
    if (!isValid(config[key]))
      throw new TypeError(`${kind} has invalid decision parameter ${key}`);
}

function validateCounts(config, kind) {
  requireParameters(
    config,
    kind,
    [
      'requestedBlocks',
      'minimumBlocks',
      'maxAttempts',
      'measuredBatchCount',
      'bootstrapResamples',
    ],
    (value) => Number.isInteger(value) && value > 0
  );
  if (config.requestedBlocks < config.minimumBlocks)
    throw new TypeError(`${kind} has an invalid requested block count`);
  if (config.maxAttempts < config.requestedBlocks)
    throw new TypeError(`${kind} has an invalid maxAttempts`);
  requireParameters(
    config,
    kind,
    ['warmupMinimum', 'warmupMaximum'],
    (value) => Number.isInteger(value) && value >= 0
  );
  if (config.warmupMaximum < config.warmupMinimum)
    throw new TypeError(`${kind} has an invalid warm-up range`);
}

function validateMargins(config, kind) {
  requireParameters(
    config,
    kind,
    [
      'targetBatchMs',
      'driftThreshold',
      'bootstrapResamples',
      'runtimeNonRegressionMargin',
      'equivalenceMargin',
      'precisionMargin',
      'growthThreshold',
      'orderInteractionThreshold',
    ],
    isPositiveFinite
  );
  requireParameters(
    config,
    kind,
    ['confidence'],
    (value) => isPositiveFinite(value) && value < 1
  );
  if (config.runtimeNonRegressionMargin < 1 || config.equivalenceMargin < 1)
    throw new TypeError(`${kind} has an invalid ratio margin`);
  if (config.precisionMargin < 1 || config.growthThreshold <= 1)
    throw new TypeError(`${kind} has an invalid precision or growth margin`);
}

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
  validateCounts(config, kind);
  validateMargins(config, kind);
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

function legacyDefaults(requestedBlocks, isCorpus) {
  return {
    requestedBlocks,
    minimumBlocks: MIN_VALID_BLOCKS,
    maxAttempts: Math.max(30, requestedBlocks),
    targetBatchMs: TARGET_BATCH_MS,
    warmupMinimum: isCorpus ? 0 : MIN_WARMUPS,
    warmupMaximum: isCorpus ? 0 : MAX_WARMUPS,
    measuredBatchCount: MEASURED_BATCHES,
    driftThreshold: DRIFT_THRESHOLD,
    bootstrapResamples: BOOTSTRAP_RESAMPLES,
    confidence: 0.95,
    runtimeNonRegressionMargin: NON_REGRESSION_MARGIN,
    equivalenceMargin: isCorpus ? CORPUS_EQUIVALENCE_MARGIN : 1.1,
    precisionMargin: 1.1,
    growthThreshold: GROWTH_THRESHOLD,
    orderInteractionThreshold: Math.log(1.1),
    intervalMethod: isCorpus
      ? CORPUS_INTERVAL_METHOD
      : DECISION_INTERVAL_METHOD,
  };
}

function legacySource(artifact) {
  const config = artifact?.config ?? {};
  const blocks = artifact?.blocks?.length ?? artifact?.replicates?.length ?? 0;
  const requestedBlocks =
    config.requestedBlocks ?? config.blocks ?? config.replicates ?? blocks;
  const source = {
    ...config,
    requestedBlocks,
    measuredBatchCount:
      config.measuredBatchCount ?? config.batches ?? MEASURED_BATCHES,
  };
  return { config, blocks, source };
}

function legacyCorpusFields(config, blocks) {
  return {
    replicates: config.replicates ?? blocks,
    batches: config.batches ?? 6,
    calibrationOrderBalanced: config.calibrationOrderBalanced ?? false,
  };
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
  const isCorpus = kind === 'corpus';
  const { config, blocks, source } = legacySource(artifact);
  const requestedBlocks = source.requestedBlocks;
  const defaults = legacyDefaults(requestedBlocks, isCorpus);
  const base = { decisionConfigVersion: DECISION_CONFIG_VERSION };
  for (const [key, fallback] of Object.entries(defaults))
    base[key] = source[key] ?? fallback;
  base.precisionMethod = PRECISION_METHOD;
  if (isCorpus) return { ...base, ...legacyCorpusFields(config, blocks) };
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
