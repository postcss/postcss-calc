// Benchmark: postcss-calc (pratt) vs @csstools/css-calc on the harvested
// real-world corpus.
import { tokenize } from '../src/lib/tokenizer.js';
import { parse } from '../src/lib/parser.js';
import { simplify } from '../src/lib/simplify.js';
import { serialize } from '../src/lib/serialize.js';
import { calc as csstoolsCalc } from '@csstools/css-calc';
import { loadCorpus } from './lib/corpus.mjs';
const corpus = loadCorpus();
const ours = (s) => {
  try {
    return serialize(simplify(parse(tokenize(s))), { precision: false });
  } catch {
    return null;
  }
};
const theirs = (s) => {
  try {
    const r = csstoolsCalc(s);
    return typeof r === 'string' ? r : null;
  } catch {
    return null;
  }
};

const WARMUP_RUNS = 3;
const SAMPLES = 9;

function run(fn) {
  const start = performance.now();
  for (const s of corpus) fn(s);
  return performance.now() - start;
}

function countOutcomes(fn) {
  let okCount = 0;
  let rejectedCount = 0;
  for (const s of corpus) {
    if (fn(s) === null) rejectedCount++;
    else okCount++;
  }
  return { okCount, rejectedCount };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function bench(name, fn, samples) {
  return {
    name,
    totalMs: median(samples),
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    ...countOutcomes(fn),
  };
}

for (let i = 0; i < WARMUP_RUNS; i++) {
  run(ours);
  run(theirs);
}

const ourSamples = [];
const theirSamples = [];
for (let i = 0; i < SAMPLES; i++) {
  // Alternate the order so one implementation does not always pay the
  // first-use/JIT/GC costs associated with being run first.
  if (i % 2 === 0) {
    ourSamples.push(run(ours));
    theirSamples.push(run(theirs));
  } else {
    theirSamples.push(run(theirs));
    ourSamples.push(run(ours));
  }
}

const a = bench('postcss-calc (pratt)', ours, ourSamples);
const b = bench('@csstools/css-calc  ', theirs, theirSamples);

console.log(
  `Corpus: ${corpus.length.toLocaleString()} real-world calc() expressions`
);
console.log(
  `Running ${WARMUP_RUNS} warmup + ${SAMPLES} alternating measured samples each…\n`
);

const fmt = (s) => {
  const perCallUs = (s.totalMs * 1000) / corpus.length;
  const range = `${s.minMs.toFixed(1)}–${s.maxMs.toFixed(1)} ms`;
  return [
    s.name,
    `median ${s.totalMs.toFixed(1).padStart(6)} ms`,
    `range ${range.padStart(13)}`,
    `${perCallUs.toFixed(2).padStart(5)} µs/expr`,
    `accepted ${s.okCount.toString().padStart(5)}`,
    `rejected ${s.rejectedCount.toString().padStart(4)}`,
  ].join('   ');
};
console.log(fmt(a));
console.log(fmt(b));
const ratio = b.totalMs / a.totalMs;
const speedLabel =
  ratio >= 1
    ? `${ratio.toFixed(2)}× faster`
    : `${(1 / ratio).toFixed(2)}× slower`;
console.log(`\nSpeed: postcss-calc is ${speedLabel} than csstools.`);
console.log(
  `Coverage: postcss-calc accepts ${a.okCount}, csstools accepts ${b.okCount} ` +
    `(diff ${a.okCount - b.okCount > 0 ? '+' : ''}${a.okCount - b.okCount}).`
);
