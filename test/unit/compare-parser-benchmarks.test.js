import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  compareParserBenchmarks,
  exitCodeFor,
  reanalyzeParserBenchmark,
} from '../../scripts/benchmark/compare-parser-benchmarks.js';
import {
  syntheticCorpusArtifact,
  syntheticParserArtifact,
} from '../helpers/benchmark-artifact.js';

function withTempParserArtifact(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'postcss-calc-benchmark-'));
  try {
    const artifact = syntheticParserArtifact({
      rows: Array.from({ length: 20 }, () => ({
        baseline: [1, 2],
        candidate: [1, 2],
      })),
      workloadKeys: ['additive:cold-index:1000', 'additive:cold-index:2000'],
    });
    const artifactPath = join(directory, 'parser-artifact.json');
    writeFileSync(artifactPath, JSON.stringify(artifact));
    return fn(artifactPath, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('exitCodeFor maps benchmark analysis statuses to exit codes', () => {
  assert.equal(exitCodeFor('pass'), 0);
  assert.equal(exitCodeFor('regression'), 1);
  assert.equal(exitCodeFor('postcss-calc faster'), 0);
  assert.equal(exitCodeFor('postcss-calc slower'), 0);
  assert.equal(exitCodeFor('correctness-failure'), 3);
  assert.equal(exitCodeFor('inconclusive'), 2);
  assert.equal(exitCodeFor('unknown'), 2);
});

test('reanalyzes schema-v2 parser benchmark artifacts', () => {
  withTempParserArtifact((artifactPath) => {
    const result = reanalyzeParserBenchmark(artifactPath);
    assert.equal(result.schema, 2);
    assert.equal(result.benchmark, 'parser-simulation');
    assert.equal(result.analysis.status, 'pass');

    const analysisOnly = compareParserBenchmarks(artifactPath);
    assert.deepEqual(analysisOnly, result.analysis);
  });
});

test('reanalyzes schema-v2 corpus benchmark artifacts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'postcss-calc-benchmark-'));
  try {
    const artifact = syntheticCorpusArtifact();
    const artifactPath = join(directory, 'corpus-artifact.json');
    writeFileSync(artifactPath, JSON.stringify(artifact));

    const result = reanalyzeParserBenchmark(artifactPath);
    assert.equal(result.schema, 2);
    assert.equal(result.benchmark, 'corpus');
    assert.ok(result.analysis);
    assert.equal(typeof result.analysis.status, 'string');
    assert.ok(result.analysis.practical);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects non-schema-v2 artifacts and non-string paths', () => {
  const directory = mkdtempSync(join(tmpdir(), 'postcss-calc-benchmark-'));
  try {
    const invalidPath = join(directory, 'v1-artifact.json');
    writeFileSync(invalidPath, JSON.stringify({ schema: 1 }));
    assert.throws(
      () => reanalyzeParserBenchmark(invalidPath),
      /artifact must use schema 2/
    );
    assert.throws(
      () => compareParserBenchmarks([invalidPath]),
      /Usage: node scripts\/benchmark\/compare-parser-benchmarks\.js <schema-v2-artifact>/
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI outputs analysis and exits with expected codes', () => {
  withTempParserArtifact((artifactPath, directory) => {
    const scriptPath = join(
      process.cwd(),
      'scripts/benchmark/compare-parser-benchmarks.js'
    );

    const validRun = spawnSync(process.execPath, [scriptPath, artifactPath], {
      encoding: 'utf8',
    });
    assert.equal(validRun.status, 0);
    assert.match(validRun.stdout, /Parser benchmark: pass/);

    const noArgs = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
    });
    assert.equal(noArgs.status, 64);
    assert.match(noArgs.stderr, /Usage:/);

    const invalidArtifactPath = join(directory, 'bad.json');
    writeFileSync(invalidArtifactPath, JSON.stringify({ schema: 1 }));
    const invalidRun = spawnSync(
      process.execPath,
      [scriptPath, invalidArtifactPath],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(invalidRun.status, 64);
    assert.match(invalidRun.stderr, /artifact must use schema 2/);
  });
});
