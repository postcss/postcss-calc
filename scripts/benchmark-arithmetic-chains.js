// Benchmark parser construction for the formerly quadratic arithmetic-chain
// path. This intentionally excludes tokenization so the timings isolate AST
// construction and flattening.
import { parse } from '../src/lib/parser.js';
import { tokenize } from '../src/lib/tokenizer.js';

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
 */
function benchmark(kind, size) {
  const operator = kind === 'additive' ? ' + ' : ' * ';
  // Factors of one collapse by design, so use two for the multiplicative
  // case and keep the parsed Product representative of the full chain.
  const term = kind === 'additive' ? '1' : '2';
  const tokens = tokenize(Array(size).fill(term).join(operator));

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
  `Parser-only timing: ${WARMUP_RUNS} warmups, ${SAMPLES} median samples, ` +
    `${PARSES_PER_SAMPLE} parses/sample\n`
);

for (const kind of ['additive', 'multiplicative']) {
  console.log(kind);
  let previous = null;
  for (const size of SIZES) {
    const elapsedMs = benchmark(kind, size);
    const growth =
      previous === null ? '—' : `${(elapsedMs / previous).toFixed(2)}×`;
    console.log(
      `  ${size.toLocaleString().padStart(5)} terms  ` +
        `${elapsedMs.toFixed(3).padStart(8)} ms  growth ${growth}`
    );
    previous = elapsedMs;
  }
  console.log();
}
