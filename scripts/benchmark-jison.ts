// Benchmark: legacy jison parser vs pratt against the harvested corpus.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss, { type AcceptedPlugin } from 'postcss';

interface BenchResult {
  name: string;
  perRun: number;
  total: number;
}

async function main(): Promise<void> {
  // Dynamic imports so CJS/ESM interop works under tsx.
  const jisonPlugin = (await import('../src/index.js')).default as () => AcceptedPlugin;
  const prattPlugin = (await import('../src/pratt/src/plugin/plugin.ts')).default as () => AcceptedPlugin;

  const HERE = dirname(fileURLToPath(import.meta.url));
  const CORPUS_DIR = join(HERE, '..', 'src', 'pratt', 'test', 'corpus');

  const calcs = readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith('.txt'))
    .flatMap((f) =>
      readFileSync(join(CORPUS_DIR, f), 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0)
    );

  const css = calcs.map((calc, i) => `.rule-${i} { prop: ${calc}; }`).join('\n');

  const ITERATIONS = 100;
  const POSTCSS_OPTS = { from: undefined };

  async function bench(name: string, plugin: () => AcceptedPlugin): Promise<BenchResult> {
    for (let i = 0; i < 5; i++) {
      await postcss(plugin()).process(css, POSTCSS_OPTS);
    }
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await postcss(plugin()).process(css, POSTCSS_OPTS);
    }
    const total = performance.now() - start;
    return { name, perRun: total / ITERATIONS, total };
  }

  console.log(`\nInput: ${calcs.length} real-world calc() expressions`);
  console.log(`CSS size: ${css.length} bytes, ${calcs.length} declarations`);
  console.log(`Iterations: ${ITERATIONS} each\n`);

  const jison = await bench('jison', jisonPlugin);
  const pratt = await bench('pratt', prattPlugin);

  console.log(`  ${jison.name}:  ${jison.perRun.toFixed(2)}ms / run  (${jison.total.toFixed(0)}ms total)`);
  console.log(`  ${pratt.name}:  ${pratt.perRun.toFixed(2)}ms / run  (${pratt.total.toFixed(0)}ms total)`);

  const ratio = pratt.perRun / jison.perRun;
  const direction = ratio < 1 ? 'faster' : 'slower';
  console.log(`\n  pratt is ${(ratio < 1 ? 1 / ratio : ratio).toFixed(2)}x ${direction} than jison`);
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
