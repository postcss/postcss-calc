import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTINE_CORPUS_TARGET,
  classifyCorpusExpression,
  selectCorpusExpressions,
  stableHash,
} from '../helpers/corpus-selection.mjs';

const FIXTURE = [
  'calc(var(--a) - (var(--b) + var(--c)))',
  'calc(-(var(--a) + var(--b)))',
  'calc(1px + 2px)',
  'calc(0px + 2px)',
  'calc(1.5px + 2px)',
  'calc(1deg + 2deg)',
  'calc(1px +)',
];

test('corpus selection: is deterministic and retains grouped subtraction shapes', () => {
  const first = selectCorpusExpressions(FIXTURE, 20);
  const second = selectCorpusExpressions([...FIXTURE].reverse(), 20);
  assert.deepEqual(first, second);
  assert.equal(first.total, FIXTURE.length);
  assert.equal(first.eligible, FIXTURE.length - 1);
  assert.ok(first.selected.includes(FIXTURE[0]));
  assert.ok(first.selected.includes(FIXTURE[1]));
  assert.deepEqual(first.parserRejected, ['calc(1px +)']);
  assert.ok(!first.routineInputs.includes('calc(1px +)'));
  assert.ok(!first.allInputs.includes('calc(1px +)'));
});

test('corpus selection: structural and literal buckets distinguish boundaries', () => {
  const integer = classifyCorpusExpression('calc(1px + 2px)');
  const fraction = classifyCorpusExpression('calc(1.5px + 2px)');
  const angle = classifyCorpusExpression('calc(1deg + 2deg)');
  assert.equal(integer?.signature, fraction?.signature);
  assert.notEqual(integer?.literalBucket, fraction?.literalBucket);
  assert.notEqual(integer?.signature, angle?.signature);
  assert.equal(classifyCorpusExpression('calc(1px +)'), null);
});

test('corpus selection: hashes retain 32-bit multiplication precision', () => {
  assert.notEqual(stableHash('calc(50%)'), stableHash('calc(60%)'));
});

test('corpus selection: routine target is a bounded CI budget', () => {
  assert.ok(ROUTINE_CORPUS_TARGET >= 5000 && ROUTINE_CORPUS_TARGET <= 8000);
});
