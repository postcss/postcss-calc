// Shared corpus loader for the exploratory scripts (benchmark.mjs,
// show-divergences.mjs): reads the harvested real-world calc() corpus and
// splits it into trimmed, non-empty lines.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(ROOT, '..', '..', 'test/corpus/github-pure.txt');

export function loadCorpus() {
  return readFileSync(CORPUS, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
