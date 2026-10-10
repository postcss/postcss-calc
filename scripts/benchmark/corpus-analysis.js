import {
  DECISION_CONFIG_VERSION,
  decisionConfigForArtifact,
  validateSchemaV2Artifact,
} from './benchmark.js';
import { analyzeCorpusObservations } from './corpus-decisions.js';
import { groupResults } from './corpus-group-results.js';

/** Recompute corpus decisions from retained raw benchmark observations. */
export function analyzeCorpus(artifact) {
  if (!artifact || artifact.benchmark !== 'corpus')
    throw new TypeError('expected a corpus artifact');
  if (artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION)
    validateSchemaV2Artifact(artifact);
  const config = decisionConfigForArtifact(artifact, 'corpus');
  const groups = groupResults(
    artifact.replicates,
    artifact.seed,
    config.bootstrapResamples
  );
  const result = {
    ...analyzeCorpusObservations({
      groups,
      replicates: artifact.replicates,
      config,
      seed: artifact.seed,
    }),
    aggregate: groups.exact,
    groups,
  };
  if (
    artifact.config?.decisionConfigVersion === DECISION_CONFIG_VERSION &&
    artifact.analysis
  )
    assertStoredAnalysisMatches(artifact.analysis, result);
  return result;
}

function assertStoredAnalysisMatches(stored, expected, path = 'analysis') {
  if (
    !stored ||
    typeof stored !== 'object' ||
    Array.isArray(stored) ||
    !expected ||
    typeof expected !== 'object' ||
    Array.isArray(expected)
  )
    throw new TypeError(`${path} is not a statistical summary object`);
  const storedKeys = Object.keys(stored).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (JSON.stringify(storedKeys) !== JSON.stringify(expectedKeys))
    throw new TypeError(`${path} does not match recomputed observations`);
  for (const key of expectedKeys)
    assertStoredValue(stored[key], expected[key], `${path}.${key}`);
}

function assertStoredValue(left, right, path) {
  if (typeof right === 'number') {
    if (
      typeof left !== 'number' ||
      !Number.isFinite(left) ||
      Math.abs(left - right) > 1e-10 * Math.max(1, Math.abs(right))
    )
      throw new TypeError(`${path} does not match recomputed observations`);
  } else if (Array.isArray(right)) {
    if (!Array.isArray(left) || left.length !== right.length)
      throw new TypeError(`${path} does not match recomputed observations`);
    for (let index = 0; index < right.length; index++)
      assertStoredValue(left[index], right[index], `${path}[${index}]`);
  } else if (right && typeof right === 'object') {
    assertStoredAnalysisMatches(left, right, path);
  } else if (left !== right) {
    throw new TypeError(`${path} does not match recomputed observations`);
  }
}
