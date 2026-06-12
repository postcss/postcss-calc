// Bucket github-pure corpus divergences against @csstools/css-calc.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/lib/tokenizer.js';
import { parse } from '../src/lib/parser.js';
import { simplify } from '../src/lib/simplify.js';
import { serialize } from '../src/lib/serialize.js';
import { calc as csstoolsCalc } from '@csstools/css-calc';
const ROOT = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(ROOT, '..', 'test/corpus/github-pure.txt');
const lines = readFileSync(CORPUS, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);
const ours = (s) => {
  try {
    return serialize(simplify(parse(tokenize(s))), { precision: 10 });
  } catch {
    return null;
  }
};
const theirs = (s) => {
  try {
    const r = csstoolsCalc(s);
    return typeof r === 'string' ? r : null;
  } catch {
    return null;
  }
};
const THREW = '<threw>';
const div = [];
for (const line of lines) {
  const o = ours(line);
  const t = theirs(line);
  if (o === null && t === null) continue;
  if (o === null || t === null) {
    div.push({ input: line, ours: o ?? THREW, theirs: t ?? THREW });
    continue;
  }
  if (o === t) continue;
  // Re-feed csstools' output through our pipeline to absorb cosmetic noise.
  const ct = ours(t);
  if (ct !== null && o === ct) continue;
  div.push({ input: line, ours: o, theirs: t });
}
console.log(`Total divergences: ${div.length}`);
console.log('---');
const buckets = {
  we_threw: div.filter((d) => d.ours === THREW),
  they_threw: div.filter((d) => d.theirs === THREW),
  different_output: div.filter((d) => d.ours !== THREW && d.theirs !== THREW),
};
console.log(`we_threw:         ${buckets.we_threw.length}`);
console.log(`they_threw:       ${buckets.they_threw.length}`);
console.log(`different_output: ${buckets.different_output.length}`);
console.log('---');
console.log('=== we_threw ===');
for (const d of buckets.we_threw) console.log(d.input);
console.log('=== they_threw ===');
for (const d of buckets.they_threw.slice(0, 15)) {
  console.log(`IN:   ${d.input}\nOURS: ${d.ours}`);
}
console.log('=== different_output ===');
for (const d of buckets.different_output.slice(0, 15)) {
  console.log(`IN:     ${d.input}\nOURS:   ${d.ours}\nTHEIRS: ${d.theirs}\n`);
}
