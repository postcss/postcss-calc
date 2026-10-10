// Harvest calc() expressions from public GitHub via `gh search code`.
// Phase 1: discover paths via diversifying queries (bypasses GH's
// 1000-result-per-query cap). Phase 2: fetch raw content and extract
// paren-balanced calc() bodies.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCalcs } from './harvest/extract.js';
import { fetchRaw, searchCode } from './harvest/github.js';
import { FULL_QUERIES, LANGUAGES, PILOT_QUERIES } from './harvest/queries.js';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT_DIR = join(ROOT, 'test/corpus/github');
const FILES_DIR = join(OUT_DIR, 'files');
const EXPR_FILE = join(OUT_DIR, 'expressions.txt');
const STATE_FILE = join(OUT_DIR, '.harvest-state.json');
const args = new Set(process.argv.slice(2));
const PILOT = args.has('--pilot');
const SKIP_FETCH = args.has('--skip-fetch');
const QUERIES = PILOT ? PILOT_QUERIES : FULL_QUERIES;
mkdirSync(FILES_DIR, { recursive: true });
function loadState() {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    } catch {
      /* fall through */
    }
  }
  return { files: {}, expressions: [] };
}
function saveState(s) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
const state = loadState();
function safeName(owner, repo, path) {
  return `${owner}__${repo}__${path}`
    .replaceAll(/[/\\]/g, '_')
    .replaceAll(/[^\w.-]/g, '_');
}
// Phase 1: discover paths.
const discovered = new Map();
let queryCount = 0;
for (const query of QUERIES) {
  for (const lang of LANGUAGES) {
    queryCount++;
    process.stderr.write(
      `[${queryCount}/${QUERIES.length * LANGUAGES.length}] search ${JSON.stringify(query)} lang=${lang}\n`
    );
    const limit = PILOT ? 30 : 100;
    const results = await searchCode(query, lang, limit);
    let added = 0;
    for (const r of results) {
      const nwo = r.repository?.nameWithOwner;
      const path = r.path;
      if (!nwo || !path) continue;
      const [owner, repo] = nwo.split('/');
      if (!owner || !repo) continue;
      const key = `${nwo}:${path}`;
      if (discovered.has(key)) continue;
      discovered.set(key, { owner, repo, path });
      added++;
    }
    process.stderr.write(`    +${added} new (${discovered.size} total)\n`);
  }
}
process.stderr.write(
  `\nDiscovered ${discovered.size} unique files across ${queryCount} searches.\n\n`
);
if (SKIP_FETCH) {
  saveState(state);
  process.exit(0);
}
// Phase 2: fetch + extract.
const expressions = new Set(state.expressions);
let fetched = 0;
let skipped = 0;
let failed = 0;
let calcCount = 0;
const total = discovered.size;
let idx = 0;
for (const [key, { owner, repo, path }] of discovered) {
  idx++;
  if (state.files[key]) {
    skipped++;
    continue;
  }
  process.stderr.write(`[${idx}/${total}] fetch ${owner}/${repo}:${path}\n`);
  const raw = await fetchRaw(owner, repo, path);
  if (!raw) {
    failed++;
    continue;
  }
  fetched++;
  const fname = safeName(owner, repo, path);
  const ext =
    /\.(css|scss|less|stylus|styl)$/i.exec(path)?.[1]?.toLowerCase() ?? 'css';
  writeFileSync(join(FILES_DIR, `${fname}.${ext}`), raw);
  const calcs = extractCalcs(raw);
  for (const c of calcs) expressions.add(c);
  calcCount += calcs.length;
  state.files[key] = { calcs: calcs.length, bytes: raw.length };
  if (fetched % 25 === 0) {
    state.expressions = [...expressions];
    saveState(state);
    writeFileSync(
      EXPR_FILE,
      [...expressions].sort((a, b) => a.localeCompare(b)).join('\n') + '\n'
    );
  }
}
state.expressions = [...expressions];
saveState(state);
writeFileSync(
  EXPR_FILE,
  [...expressions].sort((a, b) => a.localeCompare(b)).join('\n') + '\n'
);
process.stderr.write(
  `\nDone. fetched=${fetched} skipped=${skipped} failed=${failed} calc-occurrences=${calcCount} unique-expressions=${expressions.size}\n`
);
process.stderr.write(`Files: ${FILES_DIR}\nExpressions: ${EXPR_FILE}\n`);
