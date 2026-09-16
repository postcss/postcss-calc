import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { calc as referenceCalc } from '@csstools/css-calc';
import { ourOutput as canonicalizeOutput } from './lib/corpus-policy.js';
/* oxlint-disable no-bitwise */

const payload = JSON.parse(
  process.argv[2] ?? (readFileSync(0, 'utf8') || '{}')
);
if (!['ours-first', 'reference-first'].includes(payload.calibrationOrder))
  throw new Error('invalid calibration order');
const TARGET_MS = payload.targetBatchMs ?? 25;
const corpus = JSON.parse(readFileSync(payload.corpusFile, 'utf8'));
const sourceRoot = payload.sourceRoot;
const oursModule = await import(pathToFileURL(`${sourceRoot}/reduce.js`).href);
const reduceCalc = oursModule.default;
const entries = payload.permutation.map((index) => corpus[index]);
const groups = [
  'exact',
  'sum',
  'product',
  'function-call',
  'opaque-call',
  'scalar',
  'source-length-q1',
  'source-length-q2',
  'source-length-q3',
  'source-length-q4',
];

function ours(input) {
  return reduceCalc(input, { precision: 10 });
}
function reference(input) {
  return referenceCalc(input);
}
function measure(fn, values, repetitions) {
  const start = performance.now();
  for (let repeat = 0; repeat < repetitions; repeat++) {
    for (const entry of values) fn(entry.input);
  }
  const elapsedMs = performance.now() - start;
  return { elapsedMs, ms: elapsedMs / repetitions };
}

function contentChecksum(outputs) {
  let checksum = 2166136261;
  for (const output of outputs) {
    const value = String(output);
    for (let index = 0; index < value.length; index++)
      checksum = Math.imul(checksum ^ value.charCodeAt(index), 16777619) >>> 0;
    checksum = Math.imul(checksum ^ 0xff, 16777619) >>> 0;
  }
  return checksum;
}

function calibrate(values, calibrationOrder) {
  let repetitions = 1;
  const samples = [];
  const measureInOrder = () => {
    const first = calibrationOrder === 'ours-first' ? ours : reference;
    const second = calibrationOrder === 'ours-first' ? reference : ours;
    const firstSample = measure(first, values, repetitions);
    const secondSample = measure(second, values, repetitions);
    return calibrationOrder === 'ours-first'
      ? { oursSample: firstSample, referenceSample: secondSample }
      : { oursSample: secondSample, referenceSample: firstSample };
  };
  let { oursSample, referenceSample } = measureInOrder();
  samples.push({
    oursMs: oursSample.elapsedMs,
    referenceMs: referenceSample.elapsedMs,
  });
  let sample = Math.max(oursSample.elapsedMs, referenceSample.elapsedMs);
  while (sample < TARGET_MS * 0.6 && repetitions < 1_000_000) {
    repetitions *= 2;
    ({ oursSample, referenceSample } = measureInOrder());
    samples.push({
      oursMs: oursSample.elapsedMs,
      referenceMs: referenceSample.elapsedMs,
    });
    sample = Math.max(oursSample.elapsedMs, referenceSample.elapsedMs);
  }
  return { repetitions, samples };
}

function lengthGroup(entry) {
  if (entry.lengthStratum) return entry.lengthStratum;
  const [q1, q2, q3] = payload.lengthQuartiles;
  if (entry.sourceLength <= q1) return 'source-length-q1';
  if (entry.sourceLength <= q2) return 'source-length-q2';
  if (entry.sourceLength <= q3) return 'source-length-q3';
  return 'source-length-q4';
}

const valuesByGroup = new Map([['exact', entries]]);
for (const group of groups.slice(1))
  valuesByGroup.set(
    group,
    entries.filter((entry) =>
      group.startsWith('source-length-')
        ? lengthGroup(entry) === group
        : entry.shape === group
    )
  );
const configurations = [];
for (const group of groups) {
  const values = valuesByGroup.get(group);
  if (!values?.length) continue;
  const calibration = calibrate(values, payload.calibrationOrder);
  configurations.push({
    group,
    values,
    repetitions: calibration.repetitions,
    calibrationSamplesMs: calibration.samples,
  });
}

const verificationChecksums = new Map();
for (const configuration of configurations) {
  const oursOutputs = [];
  const referenceOutputs = [];
  for (const entry of configuration.values) {
    const oursOutput = ours(entry.input);
    const normalizedOutput = canonicalizeOutput(oursOutput);
    const normalizedCanonical = canonicalizeOutput(entry.canonical);
    if (
      normalizedOutput === null ||
      normalizedCanonical === null ||
      normalizedOutput !== normalizedCanonical
    )
      throw new Error(
        `public reduceCalc output differs from validated canonical result: ${entry.input}`
      );
    oursOutputs.push(oursOutput);
    referenceOutputs.push(reference(entry.input));
  }
  verificationChecksums.set(configuration.group, {
    ours: contentChecksum(oursOutputs),
    reference: contentChecksum(referenceOutputs),
  });
}

const batches = [];
for (const order of payload.orders) {
  const measurements = [];
  for (const configuration of configurations) {
    const result = {};
    for (const implementation of order === 'ours-first'
      ? ['ours', 'reference']
      : ['reference', 'ours']) {
      const measured = measure(
        implementation === 'ours' ? ours : reference,
        configuration.values,
        configuration.repetitions
      );
      result[implementation] = {
        ms: measured.ms,
        elapsedMs: measured.elapsedMs,
        checksum: verificationChecksums.get(configuration.group)[
          implementation
        ],
      };
    }
    measurements.push({
      group: configuration.group,
      repetitions: configuration.repetitions,
      calibrationOrder: payload.calibrationOrder,
      calibrationSamplesMs: configuration.calibrationSamplesMs,
      ...result,
    });
  }
  batches.push({ order, measurements });
}
process.stdout.write(
  JSON.stringify({
    replicate: payload.replicate,
    calibrationOrder: payload.calibrationOrder,
    permutation: payload.permutation,
    batches,
  })
);
