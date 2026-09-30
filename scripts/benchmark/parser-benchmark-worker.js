// One fresh parser process.  The parent supplies the source tree and the
// already-derived workload order; this file deliberately has no benchmark
// state that can leak between blocks.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tokenize } from '@csstools/css-tokenizer';

const payload = JSON.parse(
  process.argv[2] ?? (readFileSync(0, 'utf8') || '{}')
);
const sourceRoot = payload.sourceRoot;
if (typeof sourceRoot !== 'string')
  throw new Error('missing parser source root');

const parser = await import(pathToFileURL(`${sourceRoot}/lib/parser.js`).href);
let blockIndex;
try {
  blockIndex = await import(
    pathToFileURL(`${sourceRoot}/lib/block-index.js`).href
  );
} catch (error) {
  if (
    !(error instanceof Error) ||
    !('code' in error) ||
    error.code !== 'ERR_MODULE_NOT_FOUND'
  ) {
    throw error;
  }
  blockIndex = undefined;
}
if (typeof parser.parse !== 'function')
  throw new Error('incompatible baseline parser API');

const TARGET_MS = payload.targetBatchMs ?? 25;
const MIN_WARMUPS = payload.warmupMinimum ?? 5;
const MAX_WARMUPS = payload.warmupMaximum ?? 10;
const MEASURED_BATCHES = payload.measuredBatchCount ?? 6;

function digest(value) {
  const hash = createHash('sha256');
  const stack = [value];
  while (stack.length) {
    const node = stack.pop();
    if (node === null || typeof node !== 'object') {
      hash.update(`${typeof node}:${String(node)};`);
      continue;
    }
    hash.update(`{${node.type ?? 'object'};`);
    for (const key of Object.keys(node).sort().reverse()) {
      hash.update(`${key}:`);
      stack.push(node[key]);
    }
    hash.update('}');
  }
  return hash.digest('hex');
}

function consume(value) {
  // A tiny iterative walk prevents the JIT from eliminating the final parse
  // of each timed batch, without putting structural hashing in the timer.
  let count = 0;
  const stack = [value];
  while (stack.length) {
    const node = stack.pop();
    count += typeof node === 'object' && node !== null ? 1 : 0;
    if (node && typeof node === 'object') {
      for (const child of Object.values(node)) {
        if (child && typeof child === 'object') stack.push(child);
      }
    }
  }
  return count;
}

function makeRun(workload) {
  const tokens = tokenize({ css: workload.source });
  const index =
    blockIndex && workload.mode === 'hot-shared-index'
      ? blockIndex.indexBlocks(tokens)
      : undefined;
  return () => {
    if (!blockIndex) return parser.parse(tokens, 0, tokens.length);
    const currentIndex = index ?? blockIndex.indexBlocks(tokens);
    return parser.parse(tokens, 0, tokens.length, currentIndex);
  };
}

function timedBatch(run, repetitions) {
  const start = performance.now();
  let last;
  for (let i = 0; i < repetitions; i++) last = run();
  const elapsed = performance.now() - start;
  return { elapsed, perRun: elapsed / repetitions, consumed: consume(last) };
}

function calibrate(run) {
  let repetitions = 1;
  const samples = [];
  let batch = timedBatch(run, repetitions);
  samples.push(batch.elapsed);
  let sample = batch.elapsed;
  while (sample < TARGET_MS * 0.6 && repetitions < 1_000_000) {
    repetitions *= 2;
    batch = timedBatch(run, repetitions);
    samples.push(batch.elapsed);
    sample = batch.elapsed;
  }
  return { repetitions, samples };
}

function stable(warmups) {
  if (warmups.length < 3) return false;
  const last = warmups.slice(-3);
  const sorted = [...last].sort((a, b) => a - b);
  const med = sorted[1];
  return med > 0 && (sorted[2] - sorted[0]) / med <= 0.1;
}

function runWorkload(workload) {
  const run = makeRun(workload);
  const structural = digest(run());
  const calibration = calibrate(run);
  const repetitions = calibration.repetitions;
  const warmups = [];
  const warmupElapsedMs = [];
  for (let i = 0; i < MAX_WARMUPS; i++) {
    const batch = timedBatch(run, repetitions);
    warmups.push(batch.perRun);
    warmupElapsedMs.push(batch.elapsed);
    if (i + 1 >= MIN_WARMUPS && stable(warmups)) break;
  }
  const measured = [];
  const measuredElapsedMs = [];
  let consumed = 0;
  for (let i = 0; i < MEASURED_BATCHES; i++) {
    const batch = timedBatch(run, repetitions);
    measured.push(batch.perRun);
    measuredElapsedMs.push(batch.elapsed);
    consumed += batch.consumed;
  }
  return {
    key: workload.key,
    repetitions,
    calibrationSamplesMs: calibration.samples,
    warmups,
    warmupElapsedMs,
    measured,
    measuredElapsedMs,
    structural,
    checksum: structural,
    consumed,
  };
}

function control() {
  const workload = {
    source: Array(5_000).fill('1').join(' + '),
    mode: 'hot-shared-index',
  };
  const run = makeRun(workload);
  const repetitions = 50;
  // The first batches after process start are slower (JIT and frequency
  // ramp).  Warm to a steady state before sampling so before/after ratios
  // measure drift during the run rather than process startup.
  for (let i = 0; i < 10; i++) timedBatch(run, repetitions);
  const samples = [];
  const elapsedMs = [];
  for (let i = 0; i < 5; i++) {
    const batch = timedBatch(run, repetitions);
    samples.push(batch.perRun);
    elapsedMs.push(batch.elapsed);
  }
  samples.sort((a, b) => a - b);
  return { medianMs: samples[2], samplesMs: elapsedMs };
}

const before = control();
const workloads = (payload.workloads ?? []).map(runWorkload);
const after = control();
process.stdout.write(
  JSON.stringify({
    revision: payload.revision,
    processOrder: payload.processOrder,
    controlBefore: before,
    controlAfter: after,
    workloads,
  })
);
