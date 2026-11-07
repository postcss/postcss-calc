// The ownership rule in src/lib/node.js: nodes are immutable once constructed,
// and subtrees may be shared between an input tree and the simplified output.
// Deep-freezing the input turns any write to a node into a TypeError (ES
// modules run in strict mode), so these properties catch in-place edits that
// would otherwise corrupt a shared subtree silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { analyze } from '../../src/lib/analyze.js';
import { simplify } from '../../src/lib/simplify.js';
import { serialize } from '../../src/lib/serialize.js';
import { parseSource } from '../helpers/parse-source.js';
import {
  astArbWithDegenerate,
  cssMathSourceArb,
  opaqueGroupedCalcArb,
} from '../helpers/arbitraries.js';

const NUM_RUNS = 300;

/** @param {unknown} value */
function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

/** Run every post-parse stage on a fresh tree from `make`. */
function runStages(make, precision) {
  const tree = make();
  const analysis = analyze(tree);
  const simplified = simplify(tree, precision);
  return { analysis, output: serialize(simplified, { precision }) };
}

function assertStagesDoNotMutate(make) {
  for (const precision of [false, 5]) {
    const expected = runStages(make, precision);
    const frozen = runStages(() => deepFreeze(make()), precision);
    assert.deepEqual(frozen, expected);
  }
}

test('property: post-parse stages never write to parsed source trees', () => {
  fc.assert(
    fc.property(
      fc.oneof(
        cssMathSourceArb,
        opaqueGroupedCalcArb.map(({ input }) => input)
      ),
      (source) => {
        if (parseSource(source) === null) return;
        assertStagesDoNotMutate(() => parseSource(source));
      }
    ),
    { numRuns: NUM_RUNS }
  );
});

test('property: post-parse stages never write to canonical ASTs', () => {
  fc.assert(
    fc.property(astArbWithDegenerate(4), (ast) => {
      assertStagesDoNotMutate(() => structuredClone(ast));
    }),
    { numRuns: NUM_RUNS }
  );
});

test('simplified output shares no writable state with a frozen input', () => {
  const source = 'calc(1px - (var(--a) + 1px + 1px))';
  const frozen = deepFreeze(parseSource(source));
  const once = simplify(frozen);
  const again = simplify(deepFreeze(once));
  assert.equal(serialize(again), serialize(once));
  assert.equal(serialize(once), 'calc(1px - (2px + var(--a)))');
});
