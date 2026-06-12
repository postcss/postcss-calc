// Runs the @rmenke/css-tokenizer-tests corpus against our tokenizer.

import { testCorpus } from '@rmenke/css-tokenizer-tests';

import { tokenize as ourTokenize } from '../src/lib/tokenizer.js';
import {
  fromCsstools,
  fromOurs,
  compareStreams,
  OutOfSubsetError,
  type SimpleToken,
} from './tokenizer-compat.ts';

const buckets = {
  pass: [] as string[],
  fail: [] as Array<{ name: string; css: string; detail: string }>,
  'out-of-scope': [] as Array<{ name: string; why: string }>,
};

const fmt = (t: SimpleToken | null): string => {
  if (!t) return '<end>';
  const text = t.name ?? `${t.num}${t.unit ?? ''}`;
  const wsFlag = t.ws ? ', ws' : '';
  return `${t.type}(${JSON.stringify(text)}${wsFlag})`;
};

for (const [name, testCase] of Object.entries(testCorpus)) {
  let expected;
  try {
    expected = fromCsstools(testCase.tokens);
  } catch (e) {
    if (e instanceof OutOfSubsetError) {
      buckets['out-of-scope'].push({ name, why: e.message });
      continue;
    }
    throw e;
  }

  let ours;
  try {
    ours = fromOurs(ourTokenize(testCase.css));
  } catch (e) {
    buckets.fail.push({
      name,
      css: testCase.css,
      detail: `threw: ${(e as Error).message}`,
    });
    continue;
  }

  const diff = compareStreams(ours, expected);
  if (!diff) {
    buckets.pass.push(name);
  } else {
    buckets.fail.push({
      name,
      css: testCase.css,
      detail: `token #${diff.index}: ours ${fmt(diff.ours)} vs expected ${fmt(diff.theirs)}`,
    });
  }
}

const total = Object.values(buckets).reduce((n, b) => n + b.length, 0);
console.log(`css-tokenizer-tests: ${total} cases`);
console.log(`  pass:         ${buckets.pass.length}`);
console.log(`  fail:         ${buckets.fail.length}`);
console.log(`  out-of-scope: ${buckets['out-of-scope'].length}  (token types outside the calc subset)`);

if (buckets.fail.length) {
  console.log('\n=== FAILURES (in-subset divergence — real bugs) ===');
  for (const f of buckets.fail) {
    console.log(`CASE:   ${f.name}`);
    console.log(`CSS:    ${JSON.stringify(f.css)}`);
    console.log(`DETAIL: ${f.detail}`);
  }
}

const byCategory = new Map<string, { inScope: number; outOfScope: number }>();
const bump = (name: string, key: 'inScope' | 'outOfScope'): void => {
  const cat = name.split('/')[1]!;
  const e = byCategory.get(cat) ?? { inScope: 0, outOfScope: 0 };
  e[key]++;
  byCategory.set(cat, e);
};
for (const name of buckets.pass) bump(name, 'inScope');
for (const f of buckets.fail) bump(f.name, 'inScope');
for (const o of buckets['out-of-scope']) bump(o.name, 'outOfScope');

console.log('\nPer-category (ran / skipped-out-of-scope):');
for (const [cat, c] of [...byCategory.entries()].sort((a, b) =>
  a[0].localeCompare(b[0])
)) {
  console.log(`  ${cat.padEnd(20)} ${String(c.inScope).padStart(3)} / ${c.outOfScope}`);
}
