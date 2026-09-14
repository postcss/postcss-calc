// Correctness-aware fresh-process corpus benchmark against @csstools/css-calc.
import { runCorpusBenchmark, parseArgs } from './lib/corpus-benchmark.js';

try {
  const result = runCorpusBenchmark(parseArgs(process.argv.slice(2)));
  console.log(`Corpus benchmark: ${result.artifact.analysis.status}`);
  console.log(
    `Practical verdict: ${result.artifact.analysis.practical.status} ` +
      `(margin ${result.artifact.config.equivalenceMargin})`
  );
  console.log(`Estimand: ${result.artifact.correctness.estimand}`);
  console.log(`Wrote ${result.path}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = error instanceof TypeError ? 64 : 3;
}
