// Deterministic structural sampling for the harvested real-world corpus.
//
// The corpus is intentionally much larger than a routine test run needs.
// This helper keeps the full input list available to deep validation while
// choosing a stable, shape-diverse routine sample.  It derives shape from the
// real parser rather than from source spelling so whitespace and literal
// churn do not crowd out distinct calculation forms.
import { parse } from '../../src/lib/parser.js';
import { tokenize } from '../../src/lib/tokenizer.js';
import { baseOf, convert } from '../../src/lib/convertUnits.js';
import { isSupportedMathFunction } from '../../src/lib/simplify/call.js';

export const ROUTINE_CORPUS_TARGET = 6000;

/** A stable 32-bit hash; never use input order as a tie-breaker. */
export function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash, 16777619);
    // Math.imul returns a signed 32-bit result; normalize it before adding
    // the code point so every update remains an exact unsigned 32-bit value.
    if (hash < 0) hash += 4294967296;
    hash += value.charCodeAt(i);
    if (hash >= 4294967296) hash -= 4294967296;
  }
  return hash;
}

function unitClass(unit) {
  const base = baseOf(unit) ?? 'unknown';
  const canonicalUnit = {
    length: 'px',
    angle: 'deg',
    time: 's',
    frequency: 'hz',
    resolution: 'dppx',
  }[base];
  const exact = canonicalUnit && convert(1, unit, canonicalUnit) !== null;
  return `${unit}:${base}:${exact ? 'exact' : 'contextual'}`;
}

function numberBucket(value) {
  const zero = value === 0 ? 'zero' : 'nonzero';
  let sign = 'zero';
  if (value < 0) sign = 'negative';
  if (value > 0) sign = 'positive';
  return `${zero}:${sign}:${Number.isInteger(value) ? 'integer' : 'fraction'}`;
}

/**
 * @param {import('../../src/lib/node.js').Node} node
 * @param {string[]} literals
 * @return {string}
 */
function describe(node, literals) {
  switch (node.type) {
    case 'Num':
      literals.push(`number:${numberBucket(node.value)}`);
      return 'Num';
    case 'Dim':
      literals.push(
        `dimension:${unitClass(node.unit)}:${numberBucket(node.value)}`
      );
      return `Dim(${unitClass(node.unit)})`;
    case 'Ident':
      return 'Ident(opaque)';
    case 'Call': {
      const opaque =
        node.name.toLowerCase() === 'var' ||
        !isSupportedMathFunction(node.name);
      return `Call(${node.name.toLowerCase()}:${node.args.length}:${opaque ? 'opaque' : 'foldable'}:[${node.args.map((arg) => describe(arg, literals)).join(',')}])`;
    }
    case 'Sum':
      return `Sum(${node.grouped ? 'grouped' : 'flat'}:[${node.terms.map((term) => `${term.sign}:${describe(term.node, literals)}`).join(',')}])`;
    case 'Product':
      return `Product([${node.factors.map((factor) => `${factor.exponent}:${describe(factor.node, literals)}`).join(',')}])`;
  }
}

/**
 * Parse an expression and return its structural signature and literal bucket.
 * `null` means the expression could not be classified structurally. Such
 * inputs must still be retained by the differential corpus: css-calc may
 * accept an input that our parser rejects.
 */
export function classifyCorpusExpression(input) {
  try {
    const literals = [];
    const ast = parse(tokenize(input));
    // A calc wrapper accepts exactly one expression. The harvested GitHub
    // pool also contains malformed calc-like calls; those remain covered by
    // invalid-corpus resilience tests instead of becoming differential noise.
    if (
      ast.type === 'Call' &&
      ['calc', '-webkit-calc', '-moz-calc'].includes(ast.name.toLowerCase()) &&
      ast.args.length !== 1
    ) {
      return null;
    }
    const signature = describe(ast, literals);
    return { signature, literalBucket: literals.join('|') || 'no-literals' };
  } catch {
    return null;
  }
}

/**
 * Keep one hash-selected representative of every parser shape, plus one more
 * when a different literal compatibility bucket exists.  A stable globally
 * ranked fill reaches the routine budget without making source-file ordering
 * part of the selection.
 */
export function selectCorpusExpressions(
  inputs,
  target = ROUTINE_CORPUS_TARGET
) {
  const eligible = [];
  const parserRejected = [];
  for (const input of new Set(inputs)) {
    const classification = classifyCorpusExpression(input);
    if (classification) {
      eligible.push({ input, ...classification, hash: stableHash(input) });
    } else {
      parserRejected.push(input);
    }
  }

  const bySignature = new Map();
  for (const item of eligible) {
    const items = bySignature.get(item.signature) ?? [];
    items.push(item);
    bySignature.set(item.signature, items);
  }

  const selected = new Set();
  for (const items of bySignature.values()) {
    items.sort((a, b) => a.hash - b.hash || a.input.localeCompare(b.input));
    selected.add(items[0].input);
    const firstBucket = items[0].literalBucket;
    const second = items.find((item) => item.literalBucket !== firstBucket);
    if (second) selected.add(second.input);
  }

  if (selected.size < target) {
    for (const item of [...eligible].sort(
      (a, b) => a.hash - b.hash || a.input.localeCompare(b.input)
    )) {
      if (selected.size >= target) break;
      selected.add(item.input);
    }
  }

  const sortByHash = (a, b) => {
    const hashDiff = stableHash(a) - stableHash(b);
    return hashDiff || a.localeCompare(b);
  };
  return {
    total: inputs.length,
    eligible: eligible.length,
    parserRejected: parserRejected.sort(sortByHash),
    eligibleInputs: eligible
      .sort((a, b) => a.hash - b.hash || a.input.localeCompare(b.input))
      .map((item) => item.input),
    selected: [...selected].sort(sortByHash),
    routineInputs: [...selected].sort(sortByHash),
    allInputs: eligible
      .sort((a, b) => a.hash - b.hash || a.input.localeCompare(b.input))
      .map((item) => item.input),
  };
}
