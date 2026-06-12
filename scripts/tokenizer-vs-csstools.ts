// Diffs both tokenizers' streams over the real-world corpus, then times them.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokenize as csstoolsTokenize, type ParseError } from '@csstools/css-tokenizer';

import { tokenize as ourTokenize } from '../src/lib/tokenizer.js';
import {
  fromCsstools,
  fromOurs,
  compareStreams,
  OutOfSubsetError,
  type Mismatch,
} from './tokenizer-compat.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(ROOT, '..', 'src/pratt/test/corpus/github-pure.txt');
const corpus = readFileSync(CORPUS, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

interface Diverged {
  input: string;
  detail: string;
}

const equal: string[] = [];
const weThrew: Diverged[] = [];
const outOfSubset: Diverged[] = [];
const mismatched: Diverged[] = [];
let theirParseErrors = 0;

const fmt = (t: Mismatch['ours']): string => {
  if (!t) return '<end>';
  const text = t.name ?? `${t.num}${t.unit ?? ''}`;
  const wsFlag = t.ws ? ', ws' : '';
  return `${t.type}(${JSON.stringify(text)}${wsFlag})`;
};

for (const input of corpus) {
  const errors: ParseError[] = [];
  const theirTuples = csstoolsTokenize(
    { css: input },
    { onParseError: (e) => errors.push(e) }
  ).map((t) => ({
    type: t[0],
    raw: t[1],
    structured: t[4] as { value?: number | string; unit?: string } | null,
  }));
  theirParseErrors += errors.length;

  let theirs;
  try {
    theirs = fromCsstools(theirTuples);
  } catch (e) {
    if (e instanceof OutOfSubsetError) {
      outOfSubset.push({ input, detail: e.message });
      continue;
    }
    throw e;
  }

  let ours;
  try {
    ours = fromOurs(ourTokenize(input));
  } catch (e) {
    weThrew.push({ input, detail: (e as Error).message });
    continue;
  }

  const diff = compareStreams(ours, theirs);
  if (diff) {
    mismatched.push({
      input,
      detail: `token #${diff.index}: ours ${fmt(diff.ours)} vs theirs ${fmt(diff.theirs)}`,
    });
  } else {
    equal.push(input);
  }
}

console.log(`Corpus: ${corpus.length.toLocaleString()} expressions`);
console.log(`  identical streams:   ${equal.length}`);
console.log(`  we threw:            ${weThrew.length}`);
console.log(`  out of our subset:   ${outOfSubset.length}  (csstools emits token types we don't claim)`);
console.log(`  stream mismatches:   ${mismatched.length}`);
console.log(`  csstools parse errors: ${theirParseErrors}`);

const show = (label: string, list: Diverged[], n = 10): void => {
  if (!list.length) return;
  console.log(`\n=== ${label} (first ${Math.min(n, list.length)} of ${list.length}) ===`);
  for (const d of list.slice(0, n)) {
    console.log(`IN:     ${d.input}`);
    console.log(`DETAIL: ${d.detail}`);
  }
};

show('we threw', weThrew);
show('out of subset', outOfSubset);
show('mismatches', mismatched);

// --- timing -----------------------------------------------------------

const time = (fn: () => void): number => {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
};

for (let warm = 0; warm < 2; warm++) {
  for (const input of corpus) {
    try { ourTokenize(input); } catch { /* counted above */ }
    csstoolsTokenize({ css: input });
  }
}
const oursMs = time(() => {
  for (const input of corpus) {
    try { ourTokenize(input); } catch { /* counted above */ }
  }
});
const theirsMs = time(() => {
  for (const input of corpus) csstoolsTokenize({ css: input });
});
console.log(`\nTokenize-only timing (1 pass, ${corpus.length.toLocaleString()} exprs):`);
console.log(`  ours:     ${oursMs.toFixed(1)} ms`);
console.log(`  csstools: ${theirsMs.toFixed(1)} ms  (${(theirsMs / oursMs).toFixed(2)}× ours)`);
