import {
  CORPUS_CATEGORIES,
  NEUTRAL_CORPUS_CATEGORIES,
} from '../lib/corpus-policy.js';

export function validateCorpusCorrectness(artifact) {
  const correctness = artifact.correctness;
  if (
    !correctness ||
    !Number.isInteger(correctness.accepted) ||
    correctness.accepted <= 0
  )
    throw new TypeError('corpus artifact has invalid correctness metadata');
  if (!correctness.counts || !correctness.categoryHashes)
    throw new TypeError('corpus artifact is missing corpus category metadata');
  for (const category of CORPUS_CATEGORIES) {
    if (
      !Number.isInteger(correctness.counts[category]) ||
      correctness.counts[category] < 0
    )
      throw new TypeError(`corpus artifact has invalid ${category} count`);
    if (typeof correctness.categoryHashes[category] !== 'string')
      throw new TypeError(`corpus artifact has invalid ${category} hash`);
    if (
      category !== 'accepted' &&
      !NEUTRAL_CORPUS_CATEGORIES.has(category) &&
      correctness.counts[category] !== 0
    )
      throw new TypeError(
        `corpus artifact contains non-neutral ${category} inputs`
      );
  }
  if (correctness.counts.accepted !== correctness.accepted)
    throw new TypeError('corpus artifact has inconsistent accepted counts');
  if (
    typeof correctness.inputHash !== 'string' ||
    correctness.inputHash.length === 0
  )
    throw new TypeError('corpus artifact has an invalid input hash');
}

export function corpusGroups(artifact) {
  const strata = artifact.corpus?.lengthStrata;
  const shapes = artifact.corpus?.rootShapeCounts;
  if (
    !strata ||
    !shapes ||
    typeof strata !== 'object' ||
    typeof shapes !== 'object'
  )
    throw new TypeError('corpus artifact is missing group metadata');
  const groups = ['exact'];
  for (const [group, count] of Object.entries(shapes).sort())
    if (Number.isInteger(count) && count > 0) groups.push(group);
  for (const [group, count] of Object.entries(strata).sort())
    if (Number.isInteger(count) && count > 0) groups.push(group);
  return groups;
}

export function isPermutation(values, length) {
  return (
    Number.isInteger(length) &&
    Array.isArray(values) &&
    values.length === length &&
    values.every(
      (value) => Number.isInteger(value) && value >= 0 && value < length
    ) &&
    new Set(values).size === length
  );
}
