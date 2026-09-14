// Benchmark parser construction for the formerly quadratic arithmetic-chain
// path. Tokenization is outside the timed region. The cold-index case builds
// a BlockIndex for each parse; the hot-shared-index case reuses one index.
import { indexBlocks, parse } from '../src/lib/parser.js';
import { tokenize } from '@csstools/css-tokenizer';

const SIZES = [1_000, 2_000, 4_000, 8_000];
const WARMUP_RUNS = 5;
const SAMPLES = 9;
const PARSES_PER_SAMPLE = 10;

/** @param {number[]} values */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * @param {'additive' | 'multiplicative'} kind
 * @param {number} size
 * @param {boolean} hot
 */
function benchmark(kind, size, hot) {
  const operator = kind === 'additive' ? ' + ' : ' * ';
  // Factors of one collapse by design, so use two for the multiplicative
  // case and keep the parsed Product representative of the full chain.
  const term = kind === 'additive' ? '1' : '2';
  const tokens = tokenize({ css: Array(size).fill(term).join(operator) });
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

/** @type {{kind: string, mode: string, size: number, medianMs: number, growth: number | null}[]} */
const measurements = [];

console.log(
  `Parser timing (cold builds the BlockIndex; hot shares one): ` +
    `${WARMUP_RUNS} warmups, ${SAMPLES} median samples, ` +
    `${PARSES_PER_SAMPLE} parses/sample\n`
);

for (const kind of ['additive', 'multiplicative']) {
  console.log(kind);
  for (const hot of [false, true]) {
    const mode = hot ? 'hot-shared-index' : 'cold-index';
    const label = hot ? 'hot/shared-index ' : 'cold/index       ';
    let previous = null;
    for (const size of SIZES) {
      const elapsedMs = benchmark(kind, size, hot);
      const growth = previous === null ? null : elapsedMs / previous;
      console.log(
        `  ${label}${size.toLocaleString().padStart(5)} terms  ` +
          `${elapsedMs.toFixed(3).padStart(8)} ms  growth ${
            growth === null ? '—' : `${growth.toFixed(2)}×`
          }`
      );
      measurements.push({ kind, mode, size, medianMs: elapsedMs, growth });
      previous = elapsedMs;
    }
  }
  console.log();
}

console.log(
  `BENCHMARK_RESULT ${JSON.stringify({
    schema: 1,
    benchmark: 'arithmetic-chains',
    measurements,
  })}`
);
