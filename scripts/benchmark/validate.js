/* oxlint-disable complexity */
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
  if (!Array.isArray(artifact.blocks))
    throw new TypeError('artifact must contain blocks');
  const config =
    artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION
      ? validateDecisionConfig(artifact.config, 'parser artifact')
      : migrateLegacyDecisionConfig(artifact, 'parser');
  const requestedBlocks = config.requestedBlocks;
  const maxAttempts = config.maxAttempts;
  if (
    !Number.isInteger(requestedBlocks) ||
    requestedBlocks < MIN_VALID_BLOCKS ||
    requestedBlocks % 2 !== 0
  )
    throw new TypeError('artifact has an invalid requested block count');
  if (!Number.isInteger(maxAttempts) || maxAttempts < requestedBlocks)
    throw new TypeError('artifact has an invalid maxAttempts');
  const minimumBlocks = config.minimumBlocks;
  const underFloor = artifact.blocks.length < minimumBlocks;
  const isInconclusiveUnderfloorArtifact =
    underFloor &&
    artifact.analysis?.status === 'inconclusive' &&
    Array.isArray(artifact.attempts) &&
    artifact.attempts.length > 0;
  const isCorrectnessFailure =
    artifact.analysis?.status === 'correctness-failure';
  if (underFloor && !isInconclusiveUnderfloorArtifact && !isCorrectnessFailure)
    throw new TypeError(
      `artifact has fewer than ${minimumBlocks} valid blocks`
    );
  const expected = new Set(artifact.workloadKeys ?? []);
  if (expected.size === 0)
    throw new TypeError('artifact must contain workload keys');
  for (const [blockIndex, block] of artifact.blocks.entries())
    validateParserRecord(block, `block ${blockIndex}`, expected);
  if (artifact.attempts !== undefined) {
    if (!Array.isArray(artifact.attempts) || artifact.attempts.length === 0)
      throw new TypeError('artifact attempts must be a non-empty array');
    if (artifact.attempts.length > maxAttempts)
      throw new TypeError('artifact contains more attempts than maxAttempts');
    for (const [attemptIndex, attempt] of artifact.attempts.entries()) {
      validateParserRecord(
        attempt,
        `attempt ${attemptIndex}`,
        expected,
        true,
        config.driftThreshold
      );
      if (attempt.index !== attemptIndex)
        throw new TypeError(
          `attempt ${attemptIndex} has an inconsistent index`
        );
    }
    const accepted = artifact.attempts.filter((attempt) => !attempt.rejected);
    if (accepted.length !== artifact.blocks.length)
      throw new TypeError('artifact attempts and blocks are inconsistent');
    for (const [index, block] of artifact.blocks.entries()) {
      const attempt = accepted[index];
      if (JSON.stringify(attempt) !== JSON.stringify(block))
        throw new TypeError('artifact attempts and blocks are inconsistent');
    }
  } else if (underFloor) {
    throw new TypeError('under-floor artifact must retain attempts');
  }
  if (artifact.blocks.length > requestedBlocks)
    throw new TypeError('artifact contains more blocks than requested');
  if (artifact.blocks.length === requestedBlocks) {
    const orders = artifact.blocks.map((block) => block.processOrder);
    if (
      orders.filter((order) => order === 'baseline-first').length !==
      requestedBlocks / 2
    )
      throw new TypeError('accepted blocks have an unbalanced process order');
  }
  if (artifact.blocks.length >= minimumBlocks) {
    const orderCounts = {
      'baseline-first': artifact.blocks.filter(
        (block) => block.processOrder === 'baseline-first'
      ).length,
      'candidate-first': artifact.blocks.filter(
        (block) => block.processOrder === 'candidate-first'
      ).length,
    };
    if (orderCounts['baseline-first'] !== orderCounts['candidate-first'])
      throw new TypeError('accepted blocks have an unbalanced process order');
  }
  return artifact;
}
