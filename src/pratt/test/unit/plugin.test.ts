// Plugin-level tests for src/plugin/plugin.ts. Exercises the
// PostCSS adapter, option wiring, and error reporting behavior.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';

import plugin from '../../src/plugin/plugin.ts';

const POSTCSS_OPTS = { from: undefined };

async function process(
  fixture: string,
  opts: Parameters<typeof plugin>[0] = {}
): Promise<{ css: string; warnings: string[] }> {
  const result = await postcss(plugin(opts)).process(fixture, POSTCSS_OPTS);
  return { css: result.css, warnings: result.warnings().map((w) => w.text) };
}

// --- Basic pipeline ------------------------------------------------------

test('plugin: reduces simple calc in a decl', async () => {
  const { css } = await process('a{b:calc(1px + 2px)}');
  assert.equal(css, 'a{b:3px}');
});

test('plugin: preserves non-calc values', async () => {
  const { css } = await process('a{b:red}');
  assert.equal(css, 'a{b:red}');
});

test('plugin: multiple calcs in one value', async () => {
  const { css } = await process('a{b:calc(1px + 1px) calc(2px + 2px)}');
  assert.equal(css, 'a{b:2px 4px}');
});

test('plugin: vendor-prefix calcs get the same simplification', async () => {
  const { css } = await process('a{b:-webkit-calc(1px + 2px)}');
  // Round-trip preserves the prefix via serialize's calcName option.
  assert.equal(css, 'a{b:3px}');
});

test('plugin: vendor-prefix wrapper preserved when expression cannot fully resolve', async () => {
  // `-webkit-calc(1px + var(--x))` doesn't reduce to a bare value, so
  // the serializer re-wraps using `calcName: node.value`. The original
  // vendor prefix must round-trip; collapsing to plain `calc(...)` would
  // break callers targeting older browsers.
  const webkit = await process('a{b:-webkit-calc(1px + var(--x))}');
  assert.equal(webkit.css, 'a{b:-webkit-calc(1px + var(--x))}');
  const moz = await process('a{b:-moz-calc(1px + var(--x))}');
  assert.equal(moz.css, 'a{b:-moz-calc(1px + var(--x))}');
});

// --- preserve option -----------------------------------------------------

test('plugin: preserve clones the original decl alongside the simplified one', async () => {
  const { css } = await process('a{b:calc(1px + 2px)}', { preserve: true });
  assert.equal(css, 'a{b:3px;b:calc(1px + 2px)}');
});

test('plugin: preserve is a no-op when value is unchanged', async () => {
  const { css } = await process('a{b:red}', { preserve: true });
  assert.equal(css, 'a{b:red}');
});

// --- warnWhenCannotResolve -----------------------------------------------

test('plugin: warnWhenCannotResolve surfaces unresolved expressions', async () => {
  const { warnings } = await process('a{b:calc(100% + var(--x))}', {
    warnWhenCannotResolve: true,
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /Could not reduce/);
});

test('plugin: no warning when expression fully resolves', async () => {
  const { warnings } = await process('a{b:calc(1px + 2px)}', {
    warnWhenCannotResolve: true,
  });
  assert.equal(warnings.length, 0);
});

// --- mediaQueries --------------------------------------------------------

test('plugin: mediaQueries reduces calc in @media params', async () => {
  const { css } = await process(
    '@media (min-width: calc(100px + 100px)) { a{b:c} }',
    { mediaQueries: true }
  );
  assert.match(css, /min-width: 200px/);
});

test('plugin: mediaQueries off leaves @media untouched', async () => {
  const { css } = await process(
    '@media (min-width: calc(100px + 100px)) { a{b:c} }'
  );
  assert.match(css, /calc\(100px \+ 100px\)/);
});

test('plugin: mediaQueries + preserve clones the @media rule', async () => {
  // Both options together: the simplified atrule appears, followed by
  // the original (preserve clones into the parent before the live node).
  const { css } = await process(
    '@media (min-width: calc(100px + 100px)) { a{b:c} }',
    { mediaQueries: true, preserve: true }
  );
  assert.match(css, /min-width: 200px/);
  assert.match(css, /calc\(100px \+ 100px\)/);
});

// --- onParseError --------------------------------------------------------

test('plugin: default behavior on parse failure is a PostCSS warn', async () => {
  const { warnings } = await process('a{b:calc(1 /)}');
  assert.equal(warnings.length, 1);
});

test('plugin: onParseError replaces the default warn', async () => {
  const captured: Array<{ message: string; input: string }> = [];
  const { warnings } = await process('a{b:calc(1 /)}', {
    onParseError: (err, input) =>
      captured.push({ message: err.message, input }),
  });
  assert.equal(warnings.length, 0);
  assert.equal(captured.length, 1);
  assert.match(captured[0]!.message, /Unexpected token/);
  assert.equal(captured[0]!.input, '1 /');
});

test('plugin: onParseError receives the inner calc body, not the full decl', async () => {
  const inputs: string[] = [];
  await process('a{b:calc(1 /) calc(2 /)}', {
    onParseError: (_, input) => inputs.push(input),
  });
  assert.deepEqual(inputs, ['1 /', '2 /']);
});

test('plugin: division by zero now folds to infinity (no error)', async () => {
  // §10.9.1 specifies IEEE-754 propagation, so the simplifier yields
  // Dim(Infinity, px) which serializes as the canonical
  // calc(infinity * 1px) form.
  const captured: Error[] = [];
  const { css } = await process('a{b:calc(1px / 0)}', {
    onParseError: (err) => captured.push(err),
  });
  assert.equal(captured.length, 0);
  assert.equal(css, 'a{b:calc(infinity * 1px)}');
});

// --- precision -----------------------------------------------------------

test('plugin: precision option applies to numeric output', async () => {
  const { css } = await process('a{b:calc(1in + 10px)}', { precision: 2 });
  assert.equal(css, 'a{b:1.1in}');
});

test('plugin: precision false keeps full float precision', async () => {
  const { css } = await process('a{b:calc(1in + 10px)}', { precision: false });
  assert.match(css, /1\.1041666666/);
});

test('plugin: precision 0 rounds to whole numbers', async () => {
  const { css } = await process('a{b:calc(1in + 10px)}', { precision: 0 });
  assert.equal(css, 'a{b:1in}');
});

// --- Option combinations -------------------------------------------------

test('plugin: preserve + warnWhenCannotResolve — both fire together', async () => {
  // Unresolved expression gets preserved AND warned about.
  const { css, warnings } = await process('a{b:calc(100% + var(--x))}', {
    preserve: true,
    warnWhenCannotResolve: true,
  });
  // preserve clones the original alongside — both have the same
  // serialized value since the simplifier can't fully reduce this
  // expression, but the clone step still runs.
  assert.match(css, /calc\(100% \+ var\(--x\)\)/);
  assert.equal(warnings.length, 1);
});

test('plugin: onParseError catches errors in @media params (mediaQueries: true)', async () => {
  // Use a syntactically invalid calc — division-by-zero no longer throws,
  // so we provoke a real parse error instead.
  const errors: Error[] = [];
  await process('@media (min-width: calc(1px /)) { a{b:c} }', {
    mediaQueries: true,
    onParseError: (err) => errors.push(err),
  });
  assert.equal(errors.length, 1);
});

test('plugin: selectors:true reduces calc() in selector text', async () => {
  // Walking the selector with value-parser surfaces calc() function nodes
  // that aren't safely buried in attribute-value strings.
  const { css } = await process('a:nth-child(calc(1 + 2)) { b: c }', {
    selectors: true,
  });
  assert.match(css, /:nth-child\(3\)/);
});

test('plugin: onParseError does not fire for fully-resolved inputs', async () => {
  const errors: Error[] = [];
  await process('a{b:calc(1px + 2px)}', {
    onParseError: (err) => errors.push(err),
  });
  assert.equal(errors.length, 0);
});

test('plugin: options are no-ops on values with no calc()', async () => {
  // Every option branch should harmlessly ignore non-calc declarations.
  const { css, warnings } = await process(
    'a{color:red;padding:10px 20px}',
    {
      preserve: true,
      warnWhenCannotResolve: true,
      mediaQueries: true,
      selectors: true,
    }
  );
  assert.equal(css, 'a{color:red;padding:10px 20px}');
  assert.equal(warnings.length, 0);
});

// --- Bare math functions (issue #189) -----------------------------------

test('plugin: simplifies bare min() outside of calc()', async () => {
  const { css } = await process('a{ width: min(360px, 100% - 24px - 24px) }');
  assert.equal(css, 'a{ width: min(360px, 100% - 48px) }');
});

test('plugin: simplifies bare max() outside of calc()', async () => {
  const { css } = await process('a{ height: max(1px, 2px, 3px) }');
  assert.equal(css, 'a{ height: 3px }');
});

test('plugin: simplifies bare clamp() outside of calc()', async () => {
  const { css } = await process('a{ width: clamp(0px, 5px, 10px) }');
  assert.equal(css, 'a{ width: 5px }');
});

test('plugin: simplifies bare math functions case-insensitively', async () => {
  const { css } = await process('a{ width: MIN(1px, 2px) }');
  assert.equal(css, 'a{ width: 1px }');
});

test('plugin: leaves opaque-arg bare min() preserved', async () => {
  const { css } = await process('a{ width: min(1px, var(--x)) }');
  assert.equal(css, 'a{ width: min(1px, var(--x)) }');
});
