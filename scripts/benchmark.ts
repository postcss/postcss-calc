// Benchmark: postcss-calc (pratt) vs @csstools/css-calc on the harvested
// real-world corpus.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokenize } from '../src/lib/tokenizer.js';
import { parse } from '../src/lib/parser.js';
import { simplify } from '../src/lib/simplify.js';
import { serialize } from '../src/lib/serialize.js';
import { calc as csstoolsCalc } from '@csstools/css-calc';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(ROOT, '..', 'src/pratt/test/corpus/github-pure.txt');
const corpus = readFileSync(CORPUS, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

const ours = (s: string): string | null => {
  try {
    return serialize(simplify(parse(tokenize(s))), { precision: false });
  } catch {
    return null;
  }
};
const theirs = (s: string): string | null => {
  try {
    const r = csstoolsCalc(s);
    return typeof r === 'string' ? r : null;
  } catch {
    return null;
  }
};

interface Stat {
  name: string;
  totalMs: number;
  okCount: number;
  threwCount: number;
}

function bench(name: string, fn: (s: string) => string | null): Stat {
  for (let i = 0; i < 3; i++) for (const s of corpus) fn(s);

  const ITERS = 5;
  let okCount = 0;
  let threwCount = 0;
  const start = performance.now();
  for (let it = 0; it < ITERS; it++) {
    okCount = 0;
    threwCount = 0;
    for (const s of corpus) {
      const r = fn(s);
      if (r === null) threwCount++;
      else okCount++;
    }
  }
  const totalMs = (performance.now() - start) / ITERS;
  return { name, totalMs, okCount, threwCount };
}

console.log(`Corpus: ${corpus.length.toLocaleString()} real-world calc() expressions`);
console.log('Running 3 warmup + 5 measured iterations each…\n');

const a = bench('postcss-calc (pratt)', ours);
const b = bench('@csstools/css-calc  ', theirs);

const fmt = (s: Stat): string => {
  const perCallUs = (s.totalMs * 1000) / corpus.length;
  return [
    s.name,
    `total ${s.totalMs.toFixed(1).padStart(6)} ms`,
    `${perCallUs.toFixed(2).padStart(5)} µs/expr`,
    `accepted ${s.okCount.toString().padStart(5)}`,
    `threw ${s.threwCount.toString().padStart(4)}`,
  ].join('   ');
};
console.log(fmt(a));
console.log(fmt(b));

const ratio = b.totalMs / a.totalMs;
const speedLabel =
  ratio >= 1
    ? `${ratio.toFixed(2)}× faster`
    : `${(1 / ratio).toFixed(2)}× slower`;
console.log(`\nSpeed: postcss-calc is ${speedLabel} than csstools.`);
console.log(
  `Coverage: postcss-calc accepts ${a.okCount}, csstools accepts ${b.okCount} ` +
    `(diff ${a.okCount - b.okCount > 0 ? '+' : ''}${a.okCount - b.okCount}).`
);
