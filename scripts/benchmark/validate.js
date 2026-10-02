import {
  DECISION_CONFIG_VERSION,
  MIN_VALID_BLOCKS,
  migrateLegacyDecisionConfig,
  validateDecisionConfig,
} from './config.js';
import { validateCorpusArtifact } from './validate-corpus.js';
import { validateParserRecord } from './validate-parser.js';

/** @param {unknown} artifact @return {object} */
export function validateSchemaV2Artifact(artifact) {
  if (!artifact || typeof artifact !== 'object' || artifact.schema !== 2)
    throw new TypeError('artifact must use schema 2');
  if (
    typeof artifact.seed !== 'number' ||
    !Number.isInteger(artifact.seed) ||
    artifact.seed < 0 ||
    artifact.seed > 0xffffffff
  )
    throw new TypeError('artifact has an invalid seed');
  if (artifact.benchmark === 'corpus') return validateCorpusArtifact(artifact);
  return validateParserArtifact(artifact);
}

function validateParserArtifact(artifact) {
  if (!Array.isArray(artifact.blocks))
    throw new TypeError('artifact must contain blocks');
  const config =
    artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION
      ? validateDecisionConfig(artifact.config, 'parser artifact')
      : migrateLegacyDecisionConfig(artifact, 'parser');
  const { requestedBlocks, maxAttempts, minimumBlocks } = config;
  if (
    !Number.isInteger(requestedBlocks) ||
    requestedBlocks < MIN_VALID_BLOCKS ||
    requestedBlocks % 2 !== 0
  )
    throw new TypeError('artifact has an invalid requested block count');
  if (!Number.isInteger(maxAttempts) || maxAttempts < requestedBlocks)
    throw new TypeError('artifact has an invalid maxAttempts');
  const underFloor = artifact.blocks.length < minimumBlocks;
  if (underFloor && !isAllowedUnderFloor(artifact))
    throw new TypeError(
      `artifact has fewer than ${minimumBlocks} valid blocks`
    );
  const expected = new Set(artifact.workloadKeys ?? []);
  if (expected.size === 0)
    throw new TypeError('artifact must contain workload keys');
  for (const [blockIndex, block] of artifact.blocks.entries())
    validateParserRecord(block, `block ${blockIndex}`, expected);
  if (artifact.attempts !== undefined)
    validateAttempts(artifact, expected, config);
  else if (underFloor)
    throw new TypeError('under-floor artifact must retain attempts');
  validateBlockBalance(artifact.blocks, requestedBlocks, minimumBlocks);
  return artifact;
}

function isAllowedUnderFloor(artifact) {
  const status = artifact.analysis?.status;
  const isInconclusive =
    status === 'inconclusive' &&
    Array.isArray(artifact.attempts) &&
    artifact.attempts.length > 0;
  return isInconclusive || status === 'correctness-failure';
}

function validateAttempts(artifact, expected, config) {
  const { attempts, blocks } = artifact;
  if (!Array.isArray(attempts) || attempts.length === 0)
    throw new TypeError('artifact attempts must be a non-empty array');
  if (attempts.length > config.maxAttempts)
    throw new TypeError('artifact contains more attempts than maxAttempts');
  for (const [attemptIndex, attempt] of attempts.entries()) {
    validateParserRecord(
      attempt,
      `attempt ${attemptIndex}`,
      expected,
      true,
      config.driftThreshold
    );
    if (attempt.index !== attemptIndex)
      throw new TypeError(`attempt ${attemptIndex} has an inconsistent index`);
  }
  const accepted = attempts.filter((attempt) => !attempt.rejected);
  if (accepted.length !== blocks.length)
    throw new TypeError('artifact attempts and blocks are inconsistent');
  for (const [index, block] of blocks.entries())
    if (JSON.stringify(accepted[index]) !== JSON.stringify(block))
      throw new TypeError('artifact attempts and blocks are inconsistent');
}

function validateBlockBalance(blocks, requestedBlocks, minimumBlocks) {
  if (blocks.length > requestedBlocks)
    throw new TypeError('artifact contains more blocks than requested');
  const countFirst = (order) =>
    blocks.filter((block) => block.processOrder === order).length;
  if (
    blocks.length === requestedBlocks &&
    countFirst('baseline-first') !== requestedBlocks / 2
  )
    throw new TypeError('accepted blocks have an unbalanced process order');
  if (
    blocks.length >= minimumBlocks &&
    countFirst('baseline-first') !== countFirst('candidate-first')
  )
    throw new TypeError('accepted blocks have an unbalanced process order');
}
