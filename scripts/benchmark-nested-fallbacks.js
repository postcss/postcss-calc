// Benchmark parser scaling for nested var() fallbacks. Tokenization is
// outside the timed region. The cold-index case builds a BlockIndex for each
// parse; the hot-shared-index case reuses one index.
import { indexBlocks, parse } from '../src/lib/parser.js';
import { tokenize } from '@csstools/css-tokenizer';

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

/** @param {number} depth @param {boolean} hot */
function benchmark(depth, hot) {
  const input = buildNestedFallbacks(depth);
  const tokens = tokenize({ css: input });
  const index = hot ? indexBlocks(tokens) : undefined;
  const run = () =>
    hot ? parse(tokens, 0, tokens.length, index) : parse(tokens);

  for (let i = 0; i < WARMUP_RUNS; i++) {
    run();
  }

  const samples = [];
  for (let sample = 0; sample < SAMPLES; sample++) {
    const start = performance.now();
    for (let iteration = 0; iteration < PARSES_PER_SAMPLE; iteration++) {
      run();
    }
    samples.push((performance.now() - start) / PARSES_PER_SAMPLE);
  }
  return median(samples);
}

/** @type {{depth: number, mode: string, medianMs: number, growth: number | null}[]} */
const measurements = [];

console.log(
  `Nested var() fallback parser timing (cold builds the BlockIndex; hot shares one): ` +
    `${WARMUP_RUNS} warmups, ${SAMPLES} median samples, ` +
    `${PARSES_PER_SAMPLE} parses/sample\n`
);

for (const hot of [false, true]) {
  const mode = hot ? 'hot-shared-index' : 'cold-index';
  const label = hot ? 'hot/shared-index ' : 'cold/index       ';
  let previous = null;
  for (const depth of DEPTHS) {
    const elapsedMs = benchmark(depth, hot);
    const growth = previous === null ? null : elapsedMs / previous;
    console.log(
      `  ${label}${depth.toString().padStart(5)} depth  ` +
        `${elapsedMs.toFixed(3).padStart(8)} ms  growth ${
          growth === null ? '—' : `${growth.toFixed(2)}×`
        }`
    );
    measurements.push({ depth, mode, medianMs: elapsedMs, growth });
    previous = elapsedMs;
  }
}

console.log(
  `BENCHMARK_RESULT ${JSON.stringify({
    schema: 1,
    benchmark: 'nested-fallbacks',
    measurements,
  })}`
);
