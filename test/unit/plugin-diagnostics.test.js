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
// --- obsolete JavaScript options ----------------------------------------
test('plugin: obsolete preserve option is ignored at runtime', async () => {
  const { css } = await process('a{b:calc(1px + 2px)}', { preserve: true });
  assert.equal(css, 'a{b:3px}');
});

// --- warnWhenCannotResolve -----------------------------------------------
test('plugin: warnWhenCannotResolve surfaces unresolved expressions', async () => {
  const { warnings } = await process('a{b:calc(100% + var(--x))}', {
    warnWhenCannotResolve: true,
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Could not reduce/);
});

test('plugin: no warning when expression fully resolves', async () => {
  const { warnings } = await process('a{b:calc(1px + 2px)}', {
    warnWhenCannotResolve: true,
  });
  assert.equal(warnings.length, 0);
});

test('plugin: no warning when a negative expression fully resolves', async () => {
  const { css, warnings } = await process('a{b:calc(1px - 2px)}', {
    warnWhenCannotResolve: true,
  });
  assert.equal(css, 'a{b:calc(-1px)}');
  assert.equal(warnings.length, 0);
});

// --- mediaQueries --------------------------------------------------------
describe('plugin: MediaQueries', () => {
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

  test('plugin: mediaQueries transforms the @media rule in place', async () => {
    const { css } = await process(
      '@media (min-width: calc(100px + 100px)) { a{b:c} }',
      { mediaQueries: true }
    );
    assert.equal(css, '@media (min-width: 200px) { a{b:c} }');
  });

  test('plugin: mediaQueries transformations are idempotent', async () => {
    await assertIdempotent(
      '@media (min-width: calc(100px + 100px)) { a{b:c} }',
      { mediaQueries: true }
    );
  });
});

// --- onParseError --------------------------------------------------------
describe('plugin: OnParseError', () => {
  test('plugin: default behavior on parse failure is a PostCSS warn', async () => {
    const { warnings } = await process('a{b:calc(1 /)}');
    assert.equal(warnings.length, 1);
  });

  test('plugin: onParseError replaces the default warn', async () => {
    const captured = [];
    const { warnings } = await process('a{b:calc(1 /)}', {
      onParseError: (err, input) =>
        captured.push({ message: err.message, input }),
    });
    assert.equal(warnings.length, 0);
    assert.equal(captured.length, 1);
    assert.match(captured[0].message, /Unexpected token/);
    assert.equal(captured[0].input, '1 /');
  });

  test('plugin: onParseError receives the inner calc body, not the full decl', async () => {
    const inputs = [];
    await process('a{b:calc(1 /) calc(2 /)}', {
      onParseError: (_, input) => inputs.push(input),
    });
    assert.deepEqual(inputs, ['1 /', '2 /']);
  });

  test('plugin: division by zero now folds to infinity (no error)', async () => {
    // §10.9.1 specifies IEEE-754 propagation, so the simplifier yields
    // Dim(Infinity, px) which serializes as the canonical
    // calc(infinity * 1px) form.
    const captured = [];
    const { css } = await process('a{b:calc(1px / 0)}', {
      onParseError: (err) => captured.push(err),
    });
    assert.equal(captured.length, 0);
    assert.equal(css, 'a{b:calc(infinity * 1px)}');
  });
});

// --- precision -----------------------------------------------------------
describe('plugin: Precision', () => {
  test('plugin: precision option applies to numeric output', async () => {
    const { css } = await process('a{b:calc(1in + 10px)}', { precision: 2 });
    assert.equal(css, 'a{b:1.1in}');
  });

  test('plugin: precision false keeps full float precision', async () => {
    const { css } = await process('a{b:calc(1in + 10px)}', {
      precision: false,
    });
    assert.match(css, /1\.1041666666/);
  });

  test('plugin: precision 0 rounds to whole numbers', async () => {
    const { css } = await process('a{b:calc(1in + 10px)}', { precision: 0 });
    assert.equal(css, 'a{b:1in}');
  });
});
