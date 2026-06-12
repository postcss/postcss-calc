// Resilience: every corpus input must produce a string or throw a real
// synchronous Error. No hangs, no non-Error throws, no infinite loops.

import { readFileSync } from 'node:fs';

import { tokenize } from '../../../lib/tokenizer.js';
import { parse } from '../../../lib/parser.js';
import { simplify } from '../../../lib/simplify.js';
import { serialize } from '../../../lib/serialize.js';

/** Per-expression budget in ms. Exceeding this signals a likely infinite loop. */
export const PER_EXPR_BUDGET_MS = 250;

export interface ResilienceResult {
  total: number;
  ok: number;
  threwError: number;
  threwBad: Array<{ input: string; thrown: unknown }>;
  slow: Array<{ input: string; ms: number }>;
}

export function runCorpus(corpusPath: string): ResilienceResult {
  const lines = readFileSync(corpusPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result: ResilienceResult = {
    total: lines.length,
    ok: 0,
    threwError: 0,
    threwBad: [],
    slow: [],
  };

  for (const input of lines) {
    const start = performance.now();
    try {
      serialize(simplify(parse(tokenize(input))), { precision: 10 });
      result.ok++;
    } catch (err) {
      if (err instanceof Error) {
        result.threwError++;
      } else {
        result.threwBad.push({ input, thrown: err });
      }
    }
    const ms = performance.now() - start;
    if (ms > PER_EXPR_BUDGET_MS) result.slow.push({ input, ms });
  }

  return result;
}

export function assertResilience(
  r: ResilienceResult,
  label: string,
  assert: typeof import('node:assert/strict')
): void {
  console.log(
    `\n  ${label} corpus: ${r.ok} parsed, ${r.threwError} threw Error, ` +
      `${r.threwBad.length} threw non-Error, ${r.slow.length} slow (>${PER_EXPR_BUDGET_MS}ms)`
  );

  if (r.threwBad.length > 0) {
    const sample = r.threwBad
      .slice(0, 5)
      .map((b) => `  input:  ${b.input}\n  thrown: ${String(b.thrown)}`)
      .join('\n\n');
    assert.fail(
      `${r.threwBad.length} expressions threw a non-Error value (first 5):\n\n${sample}`
    );
  }

  if (r.slow.length > 0) {
    const sample = r.slow
      .slice(0, 5)
      .map((s) => `  ${s.ms.toFixed(0)}ms  ${s.input}`)
      .join('\n');
    assert.fail(
      `${r.slow.length} expressions exceeded ${PER_EXPR_BUDGET_MS}ms (first 5):\n${sample}`
    );
  }

  // Parse-success and clean-throw are both acceptable; this asserts the
  // total adds up so the report is honest.
  assert.equal(r.ok + r.threwError, r.total);
}
