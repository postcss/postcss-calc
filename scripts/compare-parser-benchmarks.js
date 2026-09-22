// Reanalyze one schema-v2 parser benchmark artifact.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { analyzeParser } from './lib/parser-benchmark.js';
import { analyzeCorpus } from './lib/corpus-benchmark.js';
import { validateSchemaV2Artifact } from './lib/benchmark.js';

const usage =
  'Usage: node scripts/compare-parser-benchmarks.js <schema-v2-artifact>';

function readArtifact(path) {
  const artifact = JSON.parse(readFileSync(path, 'utf8'));
  validateSchemaV2Artifact(artifact);
  return artifact;
}

export function reanalyzeParserBenchmark(path) {
  const artifact = readArtifact(path);
  const analysis =
    artifact.benchmark === 'corpus'
      ? analyzeCorpus(artifact)
      : analyzeParser(artifact);
  return { ...artifact, analysis };
}

function compareParserBenchmarks(path) {
  if (typeof path !== 'string') {
    throw new TypeError(usage);
  }
  return reanalyzeParserBenchmark(path).analysis;
}

function exitCodeFor(status) {
  if (status === 'pass') return 0;
  if (status === 'regression') return 1;
  if (status === 'postcss-calc faster' || status === 'postcss-calc slower')
    return 0;
  if (status === 'correctness-failure') return 3;
  return 2;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = process.argv.slice(2);
  if (files.length === 1) {
    try {
      const result = reanalyzeParserBenchmark(files[0]);
      console.log(`Parser benchmark: ${result.analysis.status}`);
      if (result.benchmark === 'corpus') {
        console.log(
          `Practical verdict: ${result.analysis.practical?.status ?? 'unknown'}`
        );
        process.exitCode = exitCodeFor(result.analysis.status);
      }
      for (const endpoint of result.analysis.endpoints ?? []) {
        console.log(
          `${endpoint.key} ${endpoint.geometricMeanPairedRuntimeRatio?.toFixed(4) ?? endpoint.deltaSlope.toFixed(4)}`
        );
      }
      process.exitCode = exitCodeFor(result.analysis.status);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 64;
    }
  } else {
    console.error(usage);
    process.exitCode = 64;
  }
}

export { compareParserBenchmarks, exitCodeFor };
