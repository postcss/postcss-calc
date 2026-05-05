// Coverage for the three opt-in flags that recover v10 / jison behavior:
// strictWhitespace (tokenizer-level), preserveOrder (simplifier output
// order), dropZeroIdentities (simplifier zero-bucket pruning). Defaults
// match the spec; each flag is independent and composes cleanly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';

import { tokenize } from '../../src/core/tokenizer.ts';
import { parse } from '../../src/core/parser.ts';
import { simplify, type SimplifyOptions } from '../../src/core/simplify.ts';
import { serialize } from '../../src/core/serialize.ts';
import plugin from '../../src/plugin/plugin.ts';

function reduce(
  input: string,
  opts: SimplifyOptions & { lenientWhitespace?: boolean } = {}
): string {
  const { lenientWhitespace, ...simplifyOpts } = opts;
  return serialize(
    simplify(parse(tokenize(input, { lenientWhitespace })), simplifyOpts)
  );
}

async function viaPlugin(
  input: string,
  opts: Parameters<typeof plugin>[0] = {}
): Promise<string> {
  const result = await postcss(plugin(opts)).process(`a{b:${input}}`, {
    from: undefined,
  });
  return result.css.replace(/^a\{b:|\}$/g, '');
}

// --- strictWhitespace ----------------------------------------------------

test('options: strictWhitespace default rejects `2px+3px`', () => {
  assert.throws(() => reduce('calc(2px+3px)'));
});

test('options: lenient mode accepts `2px+3px` and reduces it', () => {
  assert.equal(reduce('calc(2px+3px)', { lenientWhitespace: true }), '5px');
});

test('options: lenient mode accepts asymmetric whitespace around `+`', () => {
  // `2px +3px` has whitespace before `+` but none after. Strict mode
  // rejects; lenient mode accepts (matches jison).
  assert.equal(reduce('calc(2px +3px)', { lenientWhitespace: true }), '5px');
  assert.throws(() => reduce('calc(2px +3px)'));
});

test('options: lenient mode caveat — `1-1px` tokenizes as [1, -, 1px]', () => {
  // §10.1 + CSS Syntax: when the operand on the left is a bare number
  // (no unit body to absorb into), `-` is a separate token. Documents
  // the decision-log caveat about unit absorption: this only works
  // because `1` has no unit; `1px-1px` would absorb `-1px` into the
  // unit body and tokenize as a single dim.
  assert.equal(reduce('calc(1 - 1px)'), 'calc(1 - 1px)');
  assert.equal(reduce('calc(1-1px)', { lenientWhitespace: true }), 'calc(1 - 1px)');
});

test('options: plugin surface — strictWhitespace: false routes to lenient', async () => {
  const css = await viaPlugin('calc(2px+3px)', { strictWhitespace: false });
  assert.equal(css, '5px');
});

test('options: plugin surface — strict default warns on `2px+3px`', async () => {
  const result = await postcss(plugin()).process('a{b:calc(2px+3px)}', {
    from: undefined,
  });
  assert.match(result.warnings()[0]!.text, /must be surrounded by whitespace/);
});

// --- preserveOrder -------------------------------------------------------

test('options: preserveOrder keeps `var(--foo) + 10px` as written', () => {
  // Default reorders to `10px + var(--foo)` (numeric/dim first).
  assert.equal(
    reduce('calc(var(--foo) + 10px)'),
    'calc(10px + var(--foo))'
  );
  assert.equal(
    reduce('calc(var(--foo) + 10px)', { preserveOrder: true }),
    'calc(var(--foo) + 10px)'
  );
});

test('options: preserveOrder keeps `1px + 1` as written', () => {
  assert.equal(reduce('calc(1px + 1)'), 'calc(1 + 1px)');
  assert.equal(
    reduce('calc(1px + 1)', { preserveOrder: true }),
    'calc(1px + 1)'
  );
});

test('options: preserveOrder keeps `var(--m) * 1px` as written', () => {
  assert.equal(reduce('calc(var(--m) * 1px)'), 'calc(1px * var(--m))');
  assert.equal(
    reduce('calc(var(--m) * 1px)', { preserveOrder: true }),
    'calc(var(--m) * 1px)'
  );
});

test('options: preserveOrder is a no-op for sums in canonical input order', () => {
  assert.equal(
    reduce('calc(10px + var(--foo))', { preserveOrder: true }),
    'calc(10px + var(--foo))'
  );
});

test('options: preserveOrder uses first-encountered Num position in a sum', () => {
  // Two Num terms sandwiching an opaque: the FIRST num's position is the
  // anchor (idx 0), so the folded numeric total still sorts before the
  // opaque (idx 1). Catches mutants that always overwrite numFirstIndex
  // (last-Num) or initialize it to a positive value.
  assert.equal(
    reduce('calc(1 + var(--x) + 2)', { preserveOrder: true }),
    'calc(3 + var(--x))'
  );
  // Reverse: opaque-first then Num. Now the opaque (idx 0) sorts before
  // the Num (idx 1).
  assert.equal(
    reduce('calc(var(--x) + 1 + 2)', { preserveOrder: true }),
    'calc(var(--x) + 3)'
  );
});

test('options: preserveOrder uses first-encountered Num position in a product', () => {
  // Symmetric to the sum test, but for products: a sandwiched opaque
  // factor sorts after the leading Num that anchors coeffFirstIndex.
  assert.equal(
    reduce('calc(2 * var(--x) * 3)', { preserveOrder: true }),
    'calc(6 * var(--x))'
  );
  assert.equal(
    reduce('calc(var(--x) * 2 * 3)', { preserveOrder: true }),
    'calc(var(--x) * 6)'
  );
});

test('options: preserveOrder anchors a pure-cancellation coefficient at the dim position', () => {
  // `10px / 5px` cancels via tryCancelPair to a numeric factor of 2,
  // with no Num appearing as a top-level factor — coeffFirstIndex starts
  // at -1, and the cancellation path sets it to dims[0].originIndex.
  // Without that anchoring the coefficient would sort before the var
  // (originIndex 0), flipping the output to `2 * var(--x)` (canonical
  // numeric-first shape) instead of preserving input order.
  assert.equal(
    reduce('calc(var(--x) * 10px / 5px)', { preserveOrder: true }),
    'calc(var(--x) * 2)'
  );
});

test('options: preserveOrder anchors a Num past index 1', () => {
  // Sum + product variants where the Num/coefficient ends up at outer
  // position 2. Catches mutants that initialize numFirstIndex /
  // coeffFirstIndex to +1: a stray "1" anchor would tie with var(--b)
  // (which sits at index 1) and the stable-sort fallback would emit the
  // Num before var(--b) instead of after it.
  assert.equal(
    reduce('calc(var(--a) + var(--b) + 1)', { preserveOrder: true }),
    'calc(var(--a) + var(--b) + 1)'
  );
  assert.equal(
    reduce('calc(var(--a) * var(--b) * 2)', { preserveOrder: true }),
    'calc(var(--a) * var(--b) * 2)'
  );
});

test('options: preserveOrder leaves the cancellation anchor untouched when a Num already set it', () => {
  // `3 * var(--a) * 10px / 5px` — the leading `3` sets coeffFirstIndex
  // before tryCancelPair fires. The cancellation path must NOT overwrite
  // the anchor; if it did, the coefficient would land at the dim's index
  // (2) and emit `var(--a) * 6`. Original keeps it at the Num's index (0)
  // → `6 * var(--a)`.
  assert.equal(
    reduce('calc(3 * var(--a) * 10px / 5px)', { preserveOrder: true }),
    'calc(6 * var(--a))'
  );
});

test('options: preserveOrder does not undo constant folding', () => {
  // `2 * 3 * var(--x)` collapses to `6 * var(--x)` before order-aware
  // assembly; the document warns about this. preserveOrder cannot
  // recover the original `2`/`3` — coefficient-first is the only honest
  // shape we can emit.
  assert.equal(
    reduce('calc(2 * 3 * var(--x))', { preserveOrder: true }),
    'calc(6 * var(--x))'
  );
});

// --- dropZeroIdentities --------------------------------------------------

test('options: default keeps `0px + 100%` (WPT, round-trip)', () => {
  assert.equal(reduce('calc(100px - (100px - 100%))'), 'calc(0px + 100%)');
});

test('options: dropZeroIdentities collapses `0px + 100%` to `100%`', () => {
  assert.equal(
    reduce('calc(100px - (100px - 100%))', { dropZeroIdentities: true }),
    '100%'
  );
});

test('options: dropZeroIdentities preserves a sum when every bucket is 0', () => {
  // Without another typed signal there's nothing to drop *to* — emit
  // the canonical `0<unit>` of the surviving bucket.
  assert.equal(
    reduce('calc(1px - 1px)', { dropZeroIdentities: true }),
    '0px'
  );
});

test('options: dropZeroIdentities drops zero buckets next to a non-zero sibling', () => {
  assert.equal(
    reduce('calc((100px - 1em) + (-50px + 1em))', {
      dropZeroIdentities: true,
    }),
    '50px'
  );
});

test('options: dropZeroIdentities recognizes the Num total as type signal', () => {
  // No dim or opaque sibling — only a non-zero Num. The Num is enough
  // type-signal to justify dropping the 0px bucket.
  assert.equal(reduce('calc(5 + 0px)', { dropZeroIdentities: true }), '5');
});

test('options: dropZeroIdentities recognizes opaque siblings as type signal', () => {
  // No Num or other dim — only an opaque var. The opaque sibling is
  // enough type-signal to drop the 0px bucket.
  assert.equal(
    reduce('calc(var(--x) + 0px)', { dropZeroIdentities: true }),
    'var(--x)'
  );
});

// --- Composition ---------------------------------------------------------

test('options: all three flags compose cleanly', async () => {
  // Lenient parsing + preserved input order + dropped zero identities,
  // all on a single mongrel input. `+10px` and `+(...)` both have ws
  // before the `+` but none after, so strict mode would reject — only
  // lenient mode accepts. The (100px - 100px) inner sum reduces to a
  // 0px slot that dropZeroIdentities then prunes alongside the typed
  // 10px sibling.
  const css = await viaPlugin('calc(var(--x) +10px +(100px - 100px))', {
    strictWhitespace: false,
    preserveOrder: true,
    dropZeroIdentities: true,
  });
  assert.equal(css, 'calc(var(--x) + 10px)');
});
