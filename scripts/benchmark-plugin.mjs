// Benchmark the PostCSS adapter on deterministic workloads. This measures
// adapter overhead as well as the calculation pipeline; benchmark.mjs keeps
// the parser/expression benchmark separate.
import postcss from 'postcss';
import plugin from '../src/index.js';

const WARMUP_RUNS = 3;
const SAMPLES = 7;
const ITEMS_PER_WORKLOAD = 2_000;
const includeSelectors = process.argv.includes('--selectors');
const includeMedia = process.argv.includes('--media');

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function declaration(property, value, index) {
  return `.${property}-${index}{${property}:${value}}`;
}

function stylesheet(kind) {
  const declarations = [];
  for (let i = 0; i < ITEMS_PER_WORKLOAD; i++) {
    if (kind === 'ordinary') {
      declarations.push(declaration('color', i % 2 ? 'red' : 'rgb(1 2 3)', i));
    } else if (kind === 'unique') {
      declarations.push(declaration('width', `calc(${i + 1}px + 2px)`, i));
    } else if (kind === 'repeated') {
      declarations.push(declaration('width', 'calc(10px + 2px)', i));
    } else {
      declarations.push(
        declaration(
          'margin',
          `calc(${i + 1}px + 1px) calc(${i + 2}px + 2px)`,
          i
        )
      );
    }
  }
  return declarations.join('');
}

const workloads = [
  ['ordinary declarations', stylesheet('ordinary'), {}],
  ['unique calc declarations', stylesheet('unique'), {}],
  ['repeated calc declarations', stylesheet('repeated'), {}],
  ['multiple calculations per value', stylesheet('multiple'), {}],
];

if (includeSelectors) {
  workloads.push([
    'selector calculations',
    Array.from(
      { length: ITEMS_PER_WORKLOAD },
      (_, i) => `:nth-child(calc(${i + 1} + 1)){color:red}`
    ).join(''),
    { selectors: true },
  ]);
}

if (includeMedia) {
  workloads.push([
    'media-query calculations',
    Array.from(
      { length: ITEMS_PER_WORKLOAD },
      (_, i) => `@media (min-width:calc(${i + 1}px + 1px)){a{color:red}}`
    ).join(''),
    { mediaQueries: true },
  ]);
}

async function processCss(css, options) {
  await postcss(plugin(options)).process(css, { from: undefined });
}

async function benchmark(css, options) {
  for (let i = 0; i < WARMUP_RUNS; i++) await processCss(css, options);

  const samples = [];
  for (let i = 0; i < SAMPLES; i++) {
    const start = performance.now();
    await processCss(css, options);
    samples.push(performance.now() - start);
  }

  const totalMs = median(samples);
  return {
    totalMs,
    items: ITEMS_PER_WORKLOAD,
    throughput: (ITEMS_PER_WORKLOAD * 1000) / totalMs,
  };
}

console.log(
  `PostCSS adapter timing: ${WARMUP_RUNS} warmups, ${SAMPLES} median samples, ` +
    `${ITEMS_PER_WORKLOAD.toLocaleString()} items/workload`
);
console.log(
  `Optional workloads: selectors=${includeSelectors}, media=${includeMedia}\n`
);

for (const [name, css, options] of workloads) {
  const result = await benchmark(css, options);
  console.log(
    `${name.padEnd(32)} ` +
      `total ${result.totalMs.toFixed(1).padStart(8)} ms   ` +
      `items ${result.items.toLocaleString().padStart(6)}   ` +
      `throughput ${result.throughput.toFixed(0).padStart(8)} items/s`
  );
}
