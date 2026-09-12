// Benchmark parser scaling for nested var() fallbacks.
// Tokenization is performed once per depth so timings isolate parsing cost.
import { parse } from '../src/lib/parser.js';
import { tokenize } from '../src/lib/tokenizer.js';

const DEPTHS = [50, 100, 200, 400];
const WARMUP_RUNS = 5;
const SAMPLES = 9;
const PARSES_PER_SAMPLE = 10;

/** @param {number[]} values */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Build alternating calc(var(--x, ...)) expressions of given depth.
 * @param {number} depth
 * @return {string}
 */
function buildNestedFallbacks(depth) {
  let expr = 'calc(1px + 2px)';
  for (let i = depth; i >= 1; i--) {
    expr = `calc(var(--x${i}, ${expr}))`;
  }
  return expr;
}

/** @param {number} depth */
function benchmark(depth) {
  const input = buildNestedFallbacks(depth);
  const tokens = tokenize(input);

  for (let i = 0; i < WARMUP_RUNS; i++) {
    parse(tokens);
  }

  const samples = [];
  for (let sample = 0; sample < SAMPLES; sample++) {
    const start = performance.now();
    for (let iteration = 0; iteration < PARSES_PER_SAMPLE; iteration++) {
      parse(tokens);
    }
    samples.push((performance.now() - start) / PARSES_PER_SAMPLE);
  }
  return median(samples);
}

console.log(
  `Nested var() fallback parser timing: ${WARMUP_RUNS} warmups, ${SAMPLES} median samples, ` +
    `${PARSES_PER_SAMPLE} parses/sample\n`
);

let previous = null;
for (const depth of DEPTHS) {
  const elapsedMs = benchmark(depth);
  const growth =
    previous === null ? '—' : `${(elapsedMs / previous).toFixed(2)}×`;
  console.log(
    `  ${depth.toString().padStart(5)} depth  ` +
      `${elapsedMs.toFixed(3).padStart(8)} ms  growth ${growth}`
  );
  previous = elapsedMs;
}
