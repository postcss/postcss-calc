// The single comparison policy used by the conformance corpus and the corpus
// benchmark.  Keep precision and documented divergences in one place.
import { createHash } from 'node:crypto';
import { calc as csstoolsCalc } from '@csstools/css-calc';
import { tokenize } from '@csstools/css-tokenizer';
import { parse } from '../../src/lib/parser.js';
import { simplify } from '../../src/lib/simplify.js';
import { serialize } from '../../src/lib/serialize.js';

export const COMPARE_PRECISION = 10;
export const KNOWN_DIVERGENCES = new Set([
  'calc(sin(360deg) * var(--radius))',
  'calc(cos(270deg) * var(--radius))',
  'calc(sin(360deg) * var(--amplitude))',
  'calc(atan(.5) + 90deg - (var(--dir)*90deg))',
  'calc(1 / var(--√𝟤))',
  'calc(var(--➕) * -1)',
  'calc(var(--➕) * var(--✖️))',
  'calc(var(--➖) * var(--✖️))',
]);

export const CORPUS_CATEGORIES = [
  'accepted',
  'both-failed',
  'known-divergence',
  'malformed-input',
  'parser-rejected',
  'reference-rejected',
  'unexpected-divergence',
];

// These four harvested records are malformed CSS rather than unsupported
// calculation semantics. They remain in the corpus for accounting, but are
// deliberately excluded from differential timing and correctness verdicts.
export const MALFORMED_CORPUS_INPUTS = new Set([
  'calc(-1 * var(0.125rem))',
  'calc(-1 * var(0.1875rem))',
  'calc(1s * var (--i))',
  'calc(var(-code-block-padding-v) * -1)',
]);

// A reference-only rejection cannot be used as a timing comparison, but it
// is not evidence that our implementation is incorrect either.
export const NEUTRAL_CORPUS_CATEGORIES = new Set([
  'both-failed',
  'known-divergence',
  'malformed-input',
  'reference-rejected',
]);

export function ourOutput(input) {
  try {
    return serialize(simplify(parse(tokenize({ css: input }))), {
      precision: COMPARE_PRECISION,
    });
  } catch {
    return null;
  }
}
export function referenceOutput(input) {
  try {
    const output = csstoolsCalc(input);
    return typeof output === 'string' ? output : null;
  } catch {
    return null;
  }
}

export function classifyCorpusExpression(input) {
  const ours = ourOutput(input);
  const theirs = referenceOutput(input);
  if (ours === null && theirs === null)
    return { category: 'both-failed', ours, theirs };
  if (KNOWN_DIVERGENCES.has(input))
    return { category: 'known-divergence', ours, theirs };
  if (MALFORMED_CORPUS_INPUTS.has(input))
    return { category: 'malformed-input', ours, theirs };
  if (ours === null) return { category: 'parser-rejected', ours, theirs };
  if (theirs === null) return { category: 'reference-rejected', ours, theirs };
  if (ours === theirs)
    return { category: 'accepted', ours, theirs, canonical: ours };
  const canonicalTheirs = ourOutput(theirs);
  if (canonicalTheirs !== null && canonicalTheirs === ours)
    return { category: 'accepted', ours, theirs, canonical: canonicalTheirs };
  return { category: 'unexpected-divergence', ours, theirs };
}

export function validateCorpus(inputs) {
  const records = [...new Set(inputs)].map((input) => ({
    input,
    ...classifyCorpusExpression(input),
  }));
  const unexpected = records.filter(
    (record) =>
      record.category === 'unexpected-divergence' ||
      (!NEUTRAL_CORPUS_CATEGORIES.has(record.category) &&
        record.category !== 'accepted')
  );
  if (unexpected.length) {
    const first = unexpected[0];
    throw new Error(
      `unexpected corpus divergence for ${first.input}: ${first.ours} != ${first.theirs}`
    );
  }
  const counts = Object.fromEntries(
    CORPUS_CATEGORIES.map((category) => [
      category,
      records.filter((record) => record.category === category).length,
    ])
  );
  const categoryHashes = Object.fromEntries(
    CORPUS_CATEGORIES.map((category) => [
      category,
      stableHash(
        records
          .filter((record) => record.category === category)
          .map((record) => record.input)
          .sort()
          .join('\n')
      ),
    ])
  );
  return {
    records,
    counts,
    categoryHashes,
    accepted: records.filter((record) => record.category === 'accepted'),
  };
}

export function stableHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function rootShape(input) {
  const ast = parse(tokenize({ css: input }));
  const root =
    ast.type === 'Call' &&
    ast.name.toLowerCase().endsWith('calc') &&
    ast.args.length === 1
      ? ast.args[0]
      : ast;
  if (root.type === 'Sum') return 'sum';
  if (root.type === 'Product') return 'product';
  if (root.type === 'OpaqueCall') return 'opaque-call';
  if (root.type === 'Call') return 'function-call';
  return 'scalar';
}
