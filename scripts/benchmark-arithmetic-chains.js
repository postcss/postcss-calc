import { runParserBenchmark } from './lib/parser-benchmark.js';

try {
  const result = await runParserBenchmark({
    benchmark: 'arithmetic-chains',
    ...parseOptions(process.argv.slice(2)),
  });
  console.log(`Parser benchmark: ${result.artifact.analysis.status}`);
  console.log(`Wrote ${result.path}`);
  process.exitCode = exitCodeFor(result.artifact.analysis.status);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode =
    error instanceof TypeError || error instanceof RangeError ? 64 : 3;
}

function exitCodeFor(status) {
  if (status === 'pass') return 0;
  if (status === 'regression') return 1;
  return 2;
}

function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--baseline') options.baseline = args[++i];
    else if (arg === '--blocks') options.blocks = Number(args[++i]);
    else if (arg === '--max-attempts') options.maxAttempts = Number(args[++i]);
    else if (arg === '--seed') options.seed = Number(args[++i]);
    else if (arg === '--output') options.output = args[++i];
    else throw new TypeError(`invalid option: ${arg}`);
  }
  if (
    options.seed !== undefined &&
    (!Number.isInteger(options.seed) ||
      options.seed < 0 ||
      options.seed > 0xffffffff)
  )
    throw new TypeError('invalid --seed');
  if (
    options.maxAttempts !== undefined &&
    (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1)
  )
    throw new TypeError('invalid --max-attempts');
  return options;
}
