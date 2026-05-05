// Harvest calc() expressions from public GitHub via `gh search code`.
// Phase 1: discover paths via diversifying queries (bypasses GH's
// 1000-result-per-query cap). Phase 2: fetch raw content and extract
// paren-balanced calc() bodies.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT_DIR = join(ROOT, 'src/pratt/test/corpus/github');
const FILES_DIR = join(OUT_DIR, 'files');
const EXPR_FILE = join(OUT_DIR, 'expressions.txt');
const STATE_FILE = join(OUT_DIR, '.harvest-state.json');

const args = new Set(process.argv.slice(2));
const PILOT = args.has('--pilot');
const SKIP_FETCH = args.has('--skip-fetch');

const PILOT_QUERIES = [
  'calc(100%',
  'calc(var(',
  'calc(100vh',
  'calc(min(',
  'calc(clamp(',
];

const FULL_QUERIES = [
  'calc(100%', 'calc(50%', 'calc(100vh', 'calc(100vw',
  'calc(1px', 'calc(2px', 'calc(1em', 'calc(1rem', 'calc(0.5rem', 'calc(1.5rem',
  'calc(1deg', 'calc(1turn', 'calc(1s', 'calc(1fr', 'calc(1ch',
  'calc(var(', 'calc( var(',
  'calc(100% -', 'calc(100% +', 'calc(100% /', 'calc(100% *',
  'calc(min(', 'calc(max(', 'calc(clamp(', 'calc(round(', 'calc(mod(',
  'calc(abs(', 'calc(sin(', 'calc(cos(', 'calc(pow(', 'calc(sqrt(', 'calc(hypot(',
  'margin: calc(', 'padding: calc(', 'width: calc(', 'height: calc(',
  'top: calc(', 'left: calc(',
  'transform: translate(calc(', 'grid-template-columns: calc(',
  'calc((', 'calc(((', 'calc( (', 'calc( ((', 'calc(calc(', 'calc( calc(',
  'calc(0', 'calc(1', 'calc(2', 'calc(3', 'calc(4',
  'calc(5', 'calc(6', 'calc(7', 'calc(8', 'calc(9',
  'calc(.5', 'calc(.25', 'calc(-.', 'calc(-1', 'calc(-2',
  'calc(env(', 'calc(attr(',
];

const LANGUAGES = ['css', 'scss', 'less'];

const QUERIES = PILOT ? PILOT_QUERIES : FULL_QUERIES;

mkdirSync(FILES_DIR, { recursive: true });

interface State {
  files: Record<string, { calcs: number; bytes: number }>;
  expressions: string[];
}

function loadState(): State {
  if (existsSync(STATE_FILE)) {
    try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State; } catch { /* fall through */ }
  }
  return { files: {}, expressions: [] };
}
function saveState(s: State): void {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
const state = loadState();

function gh(argv: string[]): string {
  return execFileSync('gh', argv, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// GH code_search: 10 req/min. Pace at 7s; on 403 sleep until reset and retry.
const MIN_SEARCH_GAP_MS = 7000;
let lastSearchAt = 0;

async function paceSearch(): Promise<void> {
  const elapsed = Date.now() - lastSearchAt;
  if (elapsed < MIN_SEARCH_GAP_MS) await delay(MIN_SEARCH_GAP_MS - elapsed);
  lastSearchAt = Date.now();
}

async function waitForSearchReset(): Promise<void> {
  try {
    const j = JSON.parse(gh(['api', '/rate_limit']));
    const reset = j.resources?.code_search?.reset;
    if (reset) {
      const waitMs = Math.max(0, reset * 1000 - Date.now()) + 2000;
      process.stderr.write(`    rate-limit hit; sleeping ${Math.round(waitMs / 1000)}s until reset\n`);
      await delay(waitMs);
    } else {
      await delay(60_000);
    }
  } catch {
    await delay(60_000);
  }
}

interface SearchResult {
  repository?: { nameWithOwner?: string };
  path?: string;
}

async function searchCode(query: string, language: string, limit = 100): Promise<SearchResult[]> {
  // Wrap multi-word queries in literal quotes so GH treats them as a phrase.
  const phrase = /[\s+\-/*:]/.test(query) ? `"${query}"` : query;
  const argv = [
    'search', 'code', phrase,
    '--language', language,
    '--limit', String(limit),
    '--json', 'repository,path',
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    await paceSearch();
    try {
      return JSON.parse(gh(argv)) as SearchResult[];
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (/rate limit|HTTP 403|HTTP 429/i.test(msg)) {
        await waitForSearchReset();
        continue;
      }
      process.stderr.write(`  ! search failed for ${JSON.stringify(query)} lang=${language}: ${msg.split('\n')[0]}\n`);
      return [];
    }
  }
  return [];
}

// Pace fetches under 5000/hr core-API limit. 900ms ≈ 4000/hr with headroom.
const MIN_FETCH_GAP_MS = 900;
let lastFetchAt = 0;
async function paceFetch(): Promise<void> {
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < MIN_FETCH_GAP_MS) await delay(MIN_FETCH_GAP_MS - elapsed);
  lastFetchAt = Date.now();
}

async function waitForCoreReset(): Promise<void> {
  try {
    const j = JSON.parse(gh(['api', '/rate_limit']));
    const reset = j.resources?.core?.reset;
    if (reset) {
      const waitMs = Math.max(0, reset * 1000 - Date.now()) + 5000;
      process.stderr.write(`    core rate-limit hit; sleeping ${Math.round(waitMs / 1000)}s until reset\n`);
      await delay(waitMs);
    } else {
      await delay(60_000);
    }
  } catch {
    await delay(60_000);
  }
}

async function fetchRaw(owner: string, repo: string, path: string): Promise<string | null> {
  const argv = [
    'api',
    '-H', 'Accept: application/vnd.github.raw',
    `/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    await paceFetch();
    try {
      return gh(argv);
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (/rate limit|HTTP 403|HTTP 429/i.test(msg)) {
        await waitForCoreReset();
        continue;
      }
      process.stderr.write(`  ! fetch failed ${owner}/${repo}:${path}: ${msg.split('\n')[0]}\n`);
      return null;
    }
  }
  return null;
}

// Strip /* */ comments and quoted strings (replace with spaces to keep offsets).
function sanitize(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) { out += ' '.repeat(src.length - i); break; }
      out += ' '.repeat(end + 2 - i);
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out += ' ';
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < src.length) { out += '  '; i += 2; continue; }
        out += ' ';
        i++;
      }
      if (i < src.length) { out += ' '; i++; }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const CALC_RE = /(?:^|[^a-zA-Z0-9_-])(?:-(?:webkit|moz|ms|o)-)?calc\(/gi;

function extractCalcs(src: string): string[] {
  const sanitized = sanitize(src);
  const results: string[] = [];
  let m: RegExpExecArray | null;
  CALC_RE.lastIndex = 0;
  while ((m = CALC_RE.exec(sanitized)) !== null) {
    const matchEnd = m.index + m[0].length;
    const openParen = matchEnd - 1;
    const before = sanitized.slice(0, openParen).toLowerCase();
    const calcStart = before.lastIndexOf('calc');
    if (calcStart === -1) continue;
    let depth = 1;
    let j = openParen + 1;
    while (j < sanitized.length && depth > 0) {
      const ch = sanitized[j];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      j++;
    }
    if (depth !== 0) continue;
    const expr = src.slice(calcStart, j);
    const flat = expr.replace(/\s+/g, ' ').trim();
    if (flat.length > 2 && flat.length < 4096) results.push(flat);
    // Continue scanning after the open paren so nested calc()s also match.
    CALC_RE.lastIndex = matchEnd;
  }
  return results;
}

function safeName(owner: string, repo: string, path: string): string {
  return `${owner}__${repo}__${path}`.replace(/[/\\]/g, '_').replace(/[^A-Za-z0-9._-]/g, '_');
}

// Phase 1: discover paths.
const discovered = new Map<string, { owner: string; repo: string; path: string }>();
let queryCount = 0;
for (const query of QUERIES) {
  for (const lang of LANGUAGES) {
    queryCount++;
    process.stderr.write(`[${queryCount}/${QUERIES.length * LANGUAGES.length}] search ${JSON.stringify(query)} lang=${lang}\n`);
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
process.stderr.write(`\nDiscovered ${discovered.size} unique files across ${queryCount} searches.\n\n`);

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
  if (!raw) { failed++; continue; }
  fetched++;
  const fname = safeName(owner, repo, path);
  const ext = path.match(/\.(css|scss|less|stylus|styl)$/i)?.[1]?.toLowerCase() ?? 'css';
  writeFileSync(join(FILES_DIR, `${fname}.${ext}`), raw);
  const calcs = extractCalcs(raw);
  for (const c of calcs) expressions.add(c);
  calcCount += calcs.length;
  state.files[key] = { calcs: calcs.length, bytes: raw.length };
  if (fetched % 25 === 0) {
    state.expressions = [...expressions];
    saveState(state);
    writeFileSync(EXPR_FILE, [...expressions].sort().join('\n') + '\n');
  }
}

state.expressions = [...expressions];
saveState(state);
writeFileSync(EXPR_FILE, [...expressions].sort().join('\n') + '\n');

process.stderr.write(`\nDone. fetched=${fetched} skipped=${skipped} failed=${failed} calc-occurrences=${calcCount} unique-expressions=${expressions.size}\n`);
process.stderr.write(`Files: ${FILES_DIR}\nExpressions: ${EXPR_FILE}\n`);
