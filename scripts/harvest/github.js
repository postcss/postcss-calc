import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

function gh(argv) {
  // gh CLI is intentionally PATH-resolved — this is a CI/dev tool script.
  // eslint-disable-next-line sonarjs/no-os-command-from-path
  return execFileSync('gh', argv, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
// GH code_search: 10 req/min. Pace at 7s; on 403 sleep until reset and retry.
const MIN_SEARCH_GAP_MS = 7000;
let lastSearchAt = 0;
async function paceSearch() {
  const elapsed = Date.now() - lastSearchAt;
  if (elapsed < MIN_SEARCH_GAP_MS) await delay(MIN_SEARCH_GAP_MS - elapsed);
  lastSearchAt = Date.now();
}
async function waitForSearchReset() {
  try {
    const j = JSON.parse(gh(['api', '/rate_limit']));
    const reset = j.resources?.code_search?.reset;
    if (reset) {
      const waitMs = Math.max(0, reset * 1000 - Date.now()) + 2000;
      process.stderr.write(
        `    rate-limit hit; sleeping ${Math.round(waitMs / 1000)}s until reset\n`
      );
      await delay(waitMs);
    } else {
      await delay(60_000);
    }
  } catch {
    await delay(60_000);
  }
}
export async function searchCode(query, language, limit = 100) {
  // Wrap multi-word queries in literal quotes so GH treats them as a phrase.
  const phrase = /[\s+\-/*:]/.test(query) ? `"${query}"` : query;
  const argv = [
    'search',
    'code',
    phrase,
    '--language',
    language,
    '--limit',
    String(limit),
    '--json',
    'repository,path',
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    await paceSearch();
    try {
      return JSON.parse(gh(argv));
    } catch (err) {
      const msg = err.message ?? '';
      if (/rate limit|HTTP 403|HTTP 429/i.test(msg)) {
        await waitForSearchReset();
        continue;
      }
      process.stderr.write(
        `  ! search failed for ${JSON.stringify(query)} lang=${language}: ${msg.split('\n')[0]}\n`
      );
      return [];
    }
  }
  return [];
}
// Pace fetches under 5000/hr core-API limit. 900ms ≈ 4000/hr with headroom.
const MIN_FETCH_GAP_MS = 900;
let lastFetchAt = 0;
async function paceFetch() {
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < MIN_FETCH_GAP_MS) await delay(MIN_FETCH_GAP_MS - elapsed);
  lastFetchAt = Date.now();
}
async function waitForCoreReset() {
  try {
    const j = JSON.parse(gh(['api', '/rate_limit']));
    const reset = j.resources?.core?.reset;
    if (reset) {
      const waitMs = Math.max(0, reset * 1000 - Date.now()) + 5000;
      process.stderr.write(
        `    core rate-limit hit; sleeping ${Math.round(waitMs / 1000)}s until reset\n`
      );
      await delay(waitMs);
    } else {
      await delay(60_000);
    }
  } catch {
    await delay(60_000);
  }
}
export async function fetchRaw(owner, repo, path) {
  const argv = [
    'api',
    '-H',
    'Accept: application/vnd.github.raw',
    `/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    await paceFetch();
    try {
      return gh(argv);
    } catch (err) {
      const msg = err.message ?? '';
      if (/rate limit|HTTP 403|HTTP 429/i.test(msg)) {
        await waitForCoreReset();
        continue;
      }
      process.stderr.write(
        `  ! fetch failed ${owner}/${repo}:${path}: ${msg.split('\n')[0]}\n`
      );
      return null;
    }
  }
  return null;
}
