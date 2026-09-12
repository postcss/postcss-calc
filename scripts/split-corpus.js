// Split harvested expressions.txt into three buckets:
//   pure          : our parser accepts (drives csstools differential)
//   preprocessor  : SCSS/Less syntax (parser-only resilience)
//   invalid       : valid-looking CSS we reject (parser-only resilience)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/lib/tokenizer.js';
import { parse } from '../src/lib/parser.js';
import { simplify } from '../src/lib/simplify.js';
import { serialize } from '../src/lib/serialize.js';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'test/corpus/github/expressions.txt');
const PURE = join(ROOT, 'test/corpus/github-pure.txt');
const PREP = join(ROOT, 'test/corpus/github/preprocessor.txt');
const INVALID = join(ROOT, 'test/corpus/github/invalid.txt');
const PREPROC_RE = /#\{|\$[A-Za-z_]|@[A-Za-z_]|~["']/;
function ourParserAccepts(s) {
  try {
    serialize(simplify(parse(tokenize(s))), { precision: 10 });
    return true;
  } catch {
    return false;
  }
}
const lines = readFileSync(SRC, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);
const pure = [];
const prep = [];
const invalid = [];
for (const line of lines) {
  if (PREPROC_RE.test(line)) {
    prep.push(line);
  } else if (ourParserAccepts(line)) {
    pure.push(line);
  } else {
    invalid.push(line);
  }
}
const sorted = (xs) => [...xs].sort((a, b) => a.localeCompare(b));
writeFileSync(PURE, sorted(pure).join('\n') + '\n');
writeFileSync(PREP, sorted(prep).join('\n') + '\n');
writeFileSync(INVALID, sorted(invalid).join('\n') + '\n');
process.stderr.write(
  `pure:         ${pure.length}\n` +
    `preprocessor: ${prep.length}\n` +
    `invalid:      ${invalid.length}\n` +
    `total:        ${lines.length}\n`
);
