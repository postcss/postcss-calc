// Long-running differential generator. Hammers calc() inputs against
// @csstools/css-calc, ratcheting depth and bucketing inputs by token
// count. Logs divergences/throws to reports/randomizer-finds.jsonl.
//
// Env: RANDOMIZER_MODE (complex|astArb|astArbDegen, default complex),
// RANDOMIZER_DEPTH_MIN (3), RANDOMIZER_DEPTH_MAX (6),
// RANDOMIZER_BATCH (500), RANDOMIZER_LOG (path).

import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { calc as csstoolsCalc } from '@csstools/css-calc';

import { tokenize } from '../src/lib/tokenizer.js';
import { parse } from '../src/lib/parser.js';
import { simplify } from '../src/lib/simplify.js';
import { serialize } from '../src/lib/serialize.js';
import {
  astArb,
  astArbWithDegenerate,
  astToCalc,
} from '../src/pratt/test/helpers/arbitraries.ts';
import type { Node, SumTerm, ProductFactor } from '../src/lib/node.js';
import { mkSum, mkProduct } from '../src/lib/node.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPORT_DEFAULT = join(ROOT, '..', 'reports', 'randomizer-finds.jsonl');

const DEPTH_MIN = Number(process.env.RANDOMIZER_DEPTH_MIN ?? 3);
const DEPTH_MAX = Number(process.env.RANDOMIZER_DEPTH_MAX ?? 6);
const BATCH = Number(process.env.RANDOMIZER_BATCH ?? 500);
const LOG_PATH = process.env.RANDOMIZER_LOG ?? REPORT_DEFAULT;
const MODE = (process.env.RANDOMIZER_MODE ?? 'complex') as
  | 'complex' | 'astArb' | 'astArbDegen';

const COMPARE_PRECISION = 9;

type Outcome =
  | { kind: 'agree' }
  | { kind: 'both-threw' }
  | { kind: 'we-threw'; theirs: string }
  | { kind: 'they-threw'; ours: string }
  | { kind: 'mismatch'; ours: string; theirs: string };

function ourOut(input: string): string | null {
  try {
    return serialize(simplify(parse(tokenize(input))), {
      precision: COMPARE_PRECISION,
    });
  } catch {
    return null;
  }
}

function theirOut(input: string): string | null {
  try {
    const r = csstoolsCalc(input);
    return typeof r === 'string' ? r : null;
  } catch {
    return null;
  }
}

function compare(input: string): Outcome {
  const ours = ourOut(input);
  const theirs = theirOut(input);
  if (ours === null && theirs === null) return { kind: 'both-threw' };
  if (ours === null) return { kind: 'we-threw', theirs: theirs! };
  if (theirs === null) return { kind: 'they-threw', ours };
  if (ours === theirs) return { kind: 'agree' };
  // Re-feed csstools' output through our pipeline to absorb cosmetic noise.
  const ct = ourOut(theirs);
  if (ct !== null && ours === ct) return { kind: 'agree' };
  return { kind: 'mismatch', ours, theirs };
}

// Token-count buckets. `max` is exclusive; bigger lands in 'huge'.
const BUCKETS = [
  { label: 'tiny',  max: 20 },
  { label: 'small', max: 50 },
  { label: 'med',   max: 150 },
  { label: 'big',   max: 500 },
  { label: 'huge',  max: Infinity },
] as const;

function bucketOf(tokenCount: number): string {
  for (const b of BUCKETS) if (tokenCount < b.max) return b.label;
  return 'huge';
}

function countTokens(input: string): number {
  try {
    // -1 drops the trailing 'eof' token.
    return Math.max(0, tokenize(input).length - 1);
  } catch {
    return 0;
  }
}

interface Stats {
  total: number;
  agree: number;
  bothThrew: number;
  weThrew: number;
  theyThrew: number;
  mismatch: number;
  byBucket: Map<string, number>;
  byDepth: Map<number, number>;
  start: number;
}

function emptyStats(): Stats {
  return {
    total: 0, agree: 0, bothThrew: 0, weThrew: 0, theyThrew: 0,
    mismatch: 0,
    byBucket: new Map(BUCKETS.map((b) => [b.label, 0])),
    byDepth: new Map(),
    start: Date.now(),
  };
}

function logFind(record: object): void {
  appendFileSync(LOG_PATH, JSON.stringify(record) + '\n', 'utf8');
}

function fmtRate(n: number, ms: number): string {
  if (ms <= 0) return '0';
  const rate = (n * 1000) / ms;
  return rate >= 1000 ? `${(rate / 1000).toFixed(1)}k/s` : `${rate.toFixed(0)}/s`;
}

function printStatus(stats: Stats, currentDepth: number): void {
  const ms = Date.now() - stats.start;
  const buckets = [...stats.byBucket.entries()]
    .map(([k, v]) => `${k}=${v}`).join(' ');
  const finds =
    `weThrew=${stats.weThrew} theyThrew=${stats.theyThrew} mismatch=${stats.mismatch}`;
  process.stdout.write(
    `[${(ms / 1000).toFixed(0)}s] depth=${currentDepth} ` +
    `n=${stats.total} ${fmtRate(stats.total, ms)} ` +
    `agree=${stats.agree} bothThrew=${stats.bothThrew} ` +
    `${finds}  buckets[${buckets}]\n`
  );
}

// Cycle depth_min..depth_max so simpler buckets stay in rotation; they
// find the cheapest bugs.
function depthForTick(tick: number): number {
  const span = DEPTH_MAX - DEPTH_MIN + 1;
  return DEPTH_MIN + (tick % span);
}

// Pure-number leaves (small ints) so every subtree is a valid <number>
// regardless of how it's wrapped. Lets math Calls compose freely without
// type-invalid args. The hunt is structural complexity, not numeric stress.
const SMALL_INT_LEAF: fc.Arbitrary<Node> = fc
  .integer({ min: -9, max: 9 })
  .map((value): Node => ({ type: 'Num', value }));

const sign1: fc.Arbitrary<1 | -1> = fc.constantFrom(1, -1);

const complexAstArb = fc.memo((depth: number): fc.Arbitrary<Node> => {
  if (depth <= 1) return SMALL_INT_LEAF;
  const sub = complexAstArb(depth - 1);

  const sumOf = fc
    .array(fc.tuple(sign1, sub), { minLength: 2, maxLength: 6 })
    .map((pairs): Node =>
      mkSum(pairs.map(([sign, node]): SumTerm => ({ sign, node })))
    );

  const productOf = fc
    .array(fc.tuple(sign1, sub), { minLength: 2, maxLength: 6 })
    .map((pairs): Node =>
      mkProduct(
        pairs.map(([exp, node]): ProductFactor => ({ exponent: exp, node }))
      )
    );

  const minMaxCall = fc
    .tuple(
      fc.constantFrom('min', 'max'),
      fc.array(sub, { minLength: 2, maxLength: 5 })
    )
    .map(([name, args]): Node => ({ type: 'Call', name, args }));

  const clampCall = fc
    .tuple(sub, sub, sub)
    .map(([lo, val, hi]): Node => ({
      type: 'Call', name: 'clamp', args: [lo, val, hi],
    }));

  const unaryCall = fc
    .tuple(fc.constantFrom('abs', 'sign'), sub)
    .map(([name, arg]): Node => ({ type: 'Call', name, args: [arg] }));

  const binaryCall = fc
    .tuple(fc.constantFrom('round', 'mod', 'rem'), sub, sub)
    .map(([name, a, b]): Node => ({ type: 'Call', name, args: [a, b] }));

  // Small int exponent keeps results finite over deep Sum/Product bases.
  const powCall = fc
    .tuple(sub, fc.integer({ min: 0, max: 4 }))
    .map(([base, exp]): Node => ({
      type: 'Call', name: 'pow',
      args: [base, { type: 'Num', value: exp }],
    }));

  return fc.oneof(
    { weight: 1, arbitrary: SMALL_INT_LEAF },
    { weight: 3, arbitrary: sumOf },
    { weight: 3, arbitrary: productOf },
    { weight: 2, arbitrary: minMaxCall },
    { weight: 1, arbitrary: clampCall },
    { weight: 1, arbitrary: unaryCall },
    { weight: 1, arbitrary: binaryCall },
    { weight: 1, arbitrary: powCall }
  );
});

function generatorFor(depth: number): fc.Arbitrary<Node> {
  switch (MODE) {
    case 'astArb':       return astArb(depth);
    case 'astArbDegen':  return astArbWithDegenerate(depth);
    case 'complex':
    default:             return complexAstArb(depth);
  }
}

function recordOutcome(
  stats: Stats, outcome: Outcome,
  depth: number, tokens: number, bucket: string, input: string,
): void {
  switch (outcome.kind) {
    case 'agree':       stats.agree++; return;
    case 'both-threw':  stats.bothThrew++; return;
    case 'we-threw':    stats.weThrew++; break;
    case 'they-threw':  stats.theyThrew++; break;
    case 'mismatch':    stats.mismatch++; break;
  }
  logFind({
    ts: new Date().toISOString(),
    depth, tokens, bucket, input, ...outcome,
  });
}

function main(): void {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  const stats = emptyStats();
  let tick = 0;
  let lastStatus = Date.now();

  const stop = (): void => {
    printStatus(stats, depthForTick(tick));
    process.stdout.write(`\nLog: ${LOG_PATH}\n`);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  process.stdout.write(
    `randomizer: mode=${MODE}, depth ${DEPTH_MIN}..${DEPTH_MAX}, ` +
    `batch ${BATCH}, log=${LOG_PATH}\n`
  );

  while (true) {
    const depth = depthForTick(tick++);
    const samples = fc.sample(generatorFor(depth), BATCH);
    for (const ast of samples) {
      stats.total++;
      stats.byDepth.set(depth, (stats.byDepth.get(depth) ?? 0) + 1);
      const input = astToCalc(ast);
      const tokens = countTokens(input);
      const bucket = bucketOf(tokens);
      stats.byBucket.set(bucket, (stats.byBucket.get(bucket) ?? 0) + 1);
      recordOutcome(stats, compare(input), depth, tokens, bucket, input);
    }
    const now = Date.now();
    if (now - lastStatus >= 2000) {
      printStatus(stats, depth);
      lastStatus = now;
    }
  }
}

main();
