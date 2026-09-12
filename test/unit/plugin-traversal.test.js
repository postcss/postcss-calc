// Plugin-level tests for src/plugin/plugin.ts. Exercises the
// PostCSS adapter, option wiring, and error reporting behavior.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import plugin from '../../src/index.js';

const POSTCSS_OPTS = { from: undefined };

async function process(fixture, opts = {}) {
  const result = await postcss(plugin(opts)).process(fixture, POSTCSS_OPTS);
  return { css: result.css, warnings: result.warnings().map((w) => w.text) };
}

async function assertIdempotent(fixture, opts = {}) {
  const first = await process(fixture, opts);
  const second = await process(first.css, opts);

  assert.notEqual(first.css, fixture);
  assert.equal(second.css, first.css);
  assert.deepEqual(second.warnings, first.warnings);
}
// --- Option combinations -------------------------------------------------
describe('plugin: option combinations', () => {
  test('plugin: obsolete preserve option and warnWhenCannotResolve work together', async () => {
    const { css, warnings } = await process('a{b:calc(100% + var(--x))}', {
      preserve: true,
      warnWhenCannotResolve: true,
    });
    assert.equal(css, 'a{b:calc(100% + var(--x))}');
    assert.equal(warnings.length, 1);
  });

  test('plugin: onParseError catches errors in @media params (mediaQueries: true)', async () => {
    // Use a syntactically invalid calc — division-by-zero no longer throws,
    // so we provoke a real parse error instead.
    const errors = [];
    await process('@media (min-width: calc(1px /)) { a{b:c} }', {
      mediaQueries: true,
      onParseError: (err) => errors.push(err),
    });
    assert.equal(errors.length, 1);
  });

  test('plugin: selectors:true reduces calc() in selector text', async () => {
    // Walking the selector surfaces calc() function nodes that aren't safely
    // buried in attribute-value strings.
    const { css } = await process('a:nth-child(calc(1 + 2)) { b: c }', {
      selectors: true,
    });
    assert.match(css, /:nth-child\(3\)/);
  });

  test('plugin: selectors transforms the rule in place', async () => {
    const { css } = await process('a:nth-child(calc(1 + 2)) { b: c }', {
      selectors: true,
    });
    assert.equal(css, 'a:nth-child(3) { b: c }');
  });

  test('plugin: selector transformations are idempotent', async () => {
    await assertIdempotent('a:nth-child(calc(1 + 2)) { b: c }', {
      selectors: true,
    });
  });

  test('plugin: selectors serialize negative scalars without calc()', async () => {
    const { css } = await process('a:nth-child(calc(1 - 2)) { b: c }', {
      selectors: true,
    });
    assert.equal(css, 'a:nth-child(-1) { b: c }');
  });

  test('plugin: selectors serialize fractional scalars without calc()', async () => {
    const { css } = await process('a:nth-child(calc(1 / 2)) { b: c }', {
      selectors: true,
    });
    assert.equal(css, 'a:nth-child(.5) { b: c }');
  });

  test('plugin: negative selector transformations are idempotent', async () => {
    await assertIdempotent('a:nth-child(calc(1 - 2)) { b: c }', {
      selectors: true,
    });
  });

  test('plugin: onParseError does not fire for fully-resolved inputs', async () => {
    const errors = [];
    await process('a{b:calc(1px + 2px)}', {
      onParseError: (err) => errors.push(err),
    });
    assert.equal(errors.length, 0);
  });

  test('plugin: options are no-ops on values with no calc()', async () => {
    // Every option branch should harmlessly ignore non-calc declarations.
    const { css, warnings } = await process('a{color:red;padding:10px 20px}', {
      warnWhenCannotResolve: true,
      mediaQueries: true,
      selectors: true,
    });
    assert.equal(css, 'a{color:red;padding:10px 20px}');
    assert.equal(warnings.length, 0);
  });
});

// --- Bare math functions (issue #189) -----------------------------------
describe('plugin: bare math functions', () => {
  test('plugin: simplifies bare min() outside of calc()', async () => {
    const { css } = await process('a{ width: min(360px, 100% - 24px - 24px) }');
    assert.equal(css, 'a{ width: min(360px, 100% - 48px) }');
  });

  test('plugin: detects escaped math-function names', async () => {
    const { css } = await process(
      'a{width:c\\61 lc(1px + 2px);height:m\\69 n(1px, 2px)}'
    );
    assert.equal(css, 'a{width:3px;height:1px}');
  });

  test('plugin: simplifies bare max() outside of calc()', async () => {
    const { css } = await process('a{ height: max(1px, 2px, 3px) }');
    assert.equal(css, 'a{ height: 3px }');
  });

  test('plugin: simplifies bare clamp() outside of calc()', async () => {
    const { css } = await process('a{ width: clamp(0px, 5px, 10px) }');
    assert.equal(css, 'a{ width: 5px }');
  });

  test('plugin: simplifies clamp() with none keyword', async () => {
    const { css } = await process(
      'a{ a: clamp(none, 10px, 20px); b: clamp(10px, 20px, none); c: clamp(none, 10px, none); d: clamp(none, var(--x), 20px) }'
    );
    assert.equal(css, 'a{ a: 10px; b: 20px; c: 10px; d: min(var(--x), 20px) }');
  });

  test('plugin: simplifies bare math functions case-insensitively', async () => {
    const { css } = await process('a{ width: MIN(1px, 2px) }');
    assert.equal(css, 'a{ width: 1px }');
  });

  test('plugin: simplifies a supported bare function from the dispatcher', async () => {
    const { css } = await process('a{ width: pow(2, 3) }');
    assert.equal(css, 'a{ width: 8 }');
  });

  test('plugin: leaves unsupported bare functions untouched', async () => {
    const { css } = await process('a{ width: unknown(1px + 2px) }');
    assert.equal(css, 'a{ width: unknown(1px + 2px) }');
  });

  test('plugin: supported math is found inside unsupported functions', async () => {
    const { css } = await process('a{width: unknown(calc(1px + 2px))}');
    assert.equal(css, 'a{width: unknown(3px)}');
  });

  test('plugin: supported math is found inside nested simple blocks', async () => {
    const { css } = await process(
      'a{width:unknown([calc(1px + 2px)] {max(3px, 4px)})}'
    );
    assert.equal(css, 'a{width:unknown([3px] {4px})}');
  });

  test('plugin: a failing supported outer function suppresses its children', async () => {
    const inputs = [];
    const fixture = 'a{width:calc(calc(1 /) + calc(1px + 2px))}';
    const { css } = await process(fixture, {
      onParseError: (_, input) => inputs.push(input),
    });
    assert.equal(css, fixture);
    assert.deepEqual(inputs, ['calc(1 /) + calc(1px + 2px)']);
  });

  test('plugin: stray malformed closers do not hide later calculations', async () => {
    const { css } = await process('a{width:] calc(1px + 2px)}');
    assert.equal(css, 'a{width:] 3px}');
  });

  test('plugin: an unclosed function consumes through the end of a node value', async () => {
    const root = postcss.root({
      nodes: [postcss.decl({ prop: 'width', value: 'calc(1px + 2px' })],
    });
    const result = await postcss(plugin()).process(root, POSTCSS_OPTS);
    assert.equal(result.css, 'width: 3px');
  });

  test('plugin: leaves opaque-arg bare min() preserved', async () => {
    const { css } = await process('a{ width: min(1px, var(--x)) }');
    assert.equal(css, 'a{ width: min(1px, var(--x)) }');
  });
});

// --- Source-range preservation ------------------------------------------
// The outer traversal only replaces matched source ranges. These tests pin
// down that content having nothing to do with calc() remains byte-for-byte
// unchanged.
test('plugin: IE backslash hack survives the outer walk untouched', async () => {
  const { css } = await process('a{width:calc(1px + 2px)\\9}');
  assert.equal(css, 'a{width:3px\\9}');
});

describe('plugin: Escaped Content', () => {
  test('plugin: escaped content value survives the outer walk untouched', async () => {
    const { css } = await process('a{content:"\\e901"}');
    assert.equal(css, 'a{content:"\\e901"}');
  });

  test('plugin: unicode-range descriptor survives the outer walk untouched', async () => {
    const { css } = await process('@font-face{unicode-range:U+0025-00FF}');
    assert.equal(css, '@font-face{unicode-range:U+0025-00FF}');
  });

  test('plugin: url() contents are opaque, even when they look like calc()', async () => {
    const { css } = await process('a{background:url(calc(1px).png)}');
    assert.equal(css, 'a{background:url(calc(1px).png)}');
  });

  test('plugin: grid line names survive alongside a reduced calc() term', async () => {
    const { css } = await process(
      'a{grid-template-columns:[full-start] calc(1px + 2px) [full-end]}'
    );
    assert.equal(css, 'a{grid-template-columns:[full-start] 3px [full-end]}');
  });
});
