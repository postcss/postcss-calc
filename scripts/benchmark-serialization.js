// Serializer-only benchmark. ASTs are built once, then reused so timings do
// not include tokenization, parsing, or simplification. Every case is run
// through both the worktree serializer and the serializer from HEAD.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serialize as serializeWorktree } from '../src/lib/serialize.js';
import {
  num,
  dim,
  ident,
  call,
  opaqueCall,
  mkSum,
  mkProduct,
} from '../src/lib/node.js';

const WIDE_SIZES = [1_024, 16_384, 65_536];
const OTHER_SIZES = [128, 256, 512];
const WARMUP_RUNS = 3;
const SAMPLES = 7;
const TARGET_SAMPLE_MS = 150;
const MAX_REPETITIONS = 1_000_000;
let consumedBytes = 0;

/** @param {number[]} values @return {number} */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** @param {number} size @return {import('../src/lib/node.js').Node} */
function wideSum(size) {
  return mkSum(
    Array.from({ length: size }, (_, index) => ({
      sign: /** @type {1 | -1} */ (index % 3 === 0 ? -1 : 1),
      node: dim(index + 1, 'px'),
    }))
  );
}

/** @param {number} size @return {import('../src/lib/node.js').Node} */
function wideProduct(size) {
  return mkProduct(
    Array.from({ length: size }, (_, index) => ({
      exponent: /** @type {1 | -1} */ (index % 5 === 0 ? -1 : 1),
      node: num(index + 2),
    }))
  );
}

/** @param {number} size @return {import('../src/lib/node.js').Node} */
function nestedCalls(size) {
  let node = ident('--x');
  for (let i = 0; i < Math.max(2, Math.ceil(size / 4)); i++) {
    node = call('min', [node, dim(i + 1, 'px')]);
  }
  return node;
}

/** @param {number} size @return {import('../src/lib/node.js').Node} */
function nestedOpaqueFallbacks(size) {
  let node = opaqueCall('var', [ident('--x'), ', ', dim(1, 'px')]);
  const depth = Math.max(2, Math.ceil(size / 4));
  for (let i = 0; i < depth; i++) {
    node = opaqueCall('var', [ident(`--x${i}`), ', ', node]);
  }
  return node;
}

/**
 * @param {(node: import('../src/lib/node.js').Node, opts: {precision: false}) => string} serialize
 * @param {import('../src/lib/node.js').Node} node
 * @param {number} repetitions
 * @param {boolean} materialize
 * @return {number} elapsed milliseconds
 */
function measure(serialize, node, repetitions, materialize) {
  const start = performance.now();
  for (let iteration = 0; iteration < repetitions; iteration++) {
    const output = serialize(node, { precision: false });
    if (materialize) consumedBytes += Buffer.byteLength(output);
  }
  return performance.now() - start;
}

/** @param {number} repetitions @return {number} */
function clampRepetitions(repetitions) {
  return Math.min(MAX_REPETITIONS, Math.max(1, Math.ceil(repetitions)));
}

/**
 * Run paired samples with the order alternating between serializers. Both
 * serializers use the same repetition count for each sample, so their times
 * are exposed to the same short-lived runtime effects.
 *
 * @param {(node: import('../src/lib/node.js').Node, opts: {precision: false}) => string} worktreeSerializer
 * @param {(node: import('../src/lib/node.js').Node, opts: {precision: false}) => string} headSerializer
 * @param {import('../src/lib/node.js').Node} node
 * @param {boolean} materialize
 * @return {{worktree: number, head: number}}
 */
function benchmarkPair(worktreeSerializer, headSerializer, node, materialize) {
  for (let i = 0; i < WARMUP_RUNS; i++) {
    worktreeSerializer(node, { precision: false });
    headSerializer(node, { precision: false });
  }

  const calibrationWorktree = measure(worktreeSerializer, node, 1, materialize);
  const calibrationHead = measure(headSerializer, node, 1, materialize);
  let repetitions = clampRepetitions(
    TARGET_SAMPLE_MS / Math.max(calibrationWorktree, calibrationHead, 0.01)
  );
  const worktreeSamples = [];
  const headSamples = [];

  for (let sample = 0; sample < SAMPLES; sample++) {
    const first = sample % 2 === 0 ? 'worktree' : 'head';
    const firstSerializer =
      first === 'worktree' ? worktreeSerializer : headSerializer;
    const secondSerializer =
      first === 'worktree' ? headSerializer : worktreeSerializer;
    const firstMs = measure(firstSerializer, node, repetitions, materialize);
    const secondMs = measure(secondSerializer, node, repetitions, materialize);
    const worktreeMs = first === 'worktree' ? firstMs : secondMs;
    const headMs = first === 'worktree' ? secondMs : firstMs;
    worktreeSamples.push(worktreeMs / repetitions);
    headSamples.push(headMs / repetitions);

    const slowestMs = Math.max(firstMs, secondMs);
    if (slowestMs > 0) {
      repetitions = clampRepetitions(
        repetitions * (TARGET_SAMPLE_MS / slowestMs)
      );
    }
  }
  return { worktree: median(worktreeSamples), head: median(headSamples) };
}

/** @return {Promise<typeof import('../src/lib/serialize.js')>} */
async function loadHeadSerializer() {
  const root = mkdtempSync(join(tmpdir(), 'postcss-calc-serialize-'));
  const lib = join(root, 'lib');
  mkdirSync(lib);
  for (const file of ['serialize.js', 'node.js', 'opaque.js', 'limits.js']) {
    const source = execFileSync('git', ['show', `HEAD:src/lib/${file}`], {
      encoding: 'utf8',
    });
    writeFileSync(join(lib, file), source);
  }
  try {
    return await import(pathToFileURL(join(lib, 'serialize.js')).href);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const headModule = await loadHeadSerializer();
const serializeHead = headModule.serialize;
const cases = [
  ['wide sums', wideSum, WIDE_SIZES],
  ['wide products', wideProduct, WIDE_SIZES],
  ['nested calls', nestedCalls, OTHER_SIZES],
  ['nested opaque fallbacks', nestedOpaqueFallbacks, OTHER_SIZES],
];

console.log(
  `Serializer comparison: ${WARMUP_RUNS} warmups, ${SAMPLES} median samples; ` +
    'times are milliseconds per serialization\n'
);

for (const [name, build, sizes] of cases) {
  console.log(name);
  let previousWorktree = null;
  for (const size of sizes) {
    const node = build(size);
    const worktreeOutput = serializeWorktree(node, { precision: false });
    const headOutput = serializeHead(node, { precision: false });
    assert.equal(
      worktreeOutput,
      headOutput,
      `${name} (${size}) differs between the worktree and HEAD serializers`
    );
    const discarded = benchmarkPair(
      serializeWorktree,
      serializeHead,
      node,
      false
    );
    const materialized = benchmarkPair(
      serializeWorktree,
      serializeHead,
      node,
      true
    );
    const worktreeMs = discarded.worktree;
    const headMs = discarded.head;
    const materializedRatio = materialized.worktree / materialized.head;
    const growth =
      previousWorktree === null
        ? '—'
        : `${(worktreeMs / previousWorktree).toFixed(2)}×`;
    const ratio = worktreeMs / headMs;
    console.log(
      `  ${size.toLocaleString().padStart(7)} nodes  ` +
        `discarded ${worktreeMs.toFixed(3)}/${headMs.toFixed(3)} ms  ` +
        `ratio ${ratio.toFixed(2)}×  ` +
        `materialized ${materialized.worktree.toFixed(3)}/${materialized.head.toFixed(3)} ms  ` +
        `ratio ${materializedRatio.toFixed(2)}×  growth ${growth}`
    );
    previousWorktree = worktreeMs;
  }
  console.log();
}
