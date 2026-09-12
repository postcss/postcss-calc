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
// --- Basic pipeline ------------------------------------------------------
describe('plugin: basic pipeline', () => {
  test('plugin: reduces simple calc in a decl', async () => {
    const { css } = await process('a{b:calc(1px + 2px)}');
    assert.equal(css, 'a{b:3px}');
  });

  test('plugin: mixed-unit expression folds correctly in a declaration', async () => {
    const { css } = await process(
      'a{margin:calc(1em + 1px + 1in);padding:calc(1px + 1em + 1in)}'
    );
    assert.equal(css, 'a{margin:calc(1em + 97px);padding:calc(97px + 1em)}');
  });

  test('plugin: preserves non-calc values', async () => {
    const { css } = await process('a{b:red}');
    assert.equal(css, 'a{b:red}');
  });

  test('plugin: ordinary values remain byte-for-byte unchanged', async () => {
    const fixture =
      'a{content:"calc(1px + 2px)";background:url(x);custom:  red\\9 }';
    const { css } = await process(fixture, {
      mediaQueries: true,
      selectors: true,
    });
    assert.equal(css, fixture);
  });

  test('plugin: simple resolved results preserve canonical token text', async () => {
    const { css } = await process(
      'a{a:calc(1px + 2px);b:calc(10% - 2%);c:calc(1 / 4);d:calc(-2px + 1px);e:calc(1PX + 2PX)}'
    );
    assert.equal(css, 'a{a:3px;b:8%;c:calc(.25);d:calc(-1px);e:3px}');
  });

  test('plugin: negative scalar results retain calc()', async () => {
    const { css } = await process('a{width:calc(5px - 10px)}');
    assert.equal(css, 'a{width:calc(-5px)}');
  });

  test('plugin: rounded negative floating-point noise does not retain calc()', async () => {
    const { css } = await process('a{width:calc(cos(270deg) * 100px)}');
    assert.equal(css, 'a{width:0px}');
    const unrounded = await process('a{width:calc(cos(270deg) * 100px)}', {
      precision: false,
    });
    assert.equal(unrounded.css, 'a{width:calc(-1.8369701987210297e-14px)}');
  });

  test('plugin: multiple calcs in one value', async () => {
    const { css } = await process('a{b:calc(1px + 1px) calc(2px + 2px)}');
    assert.equal(css, 'a{b:2px 4px}');
  });

  test('plugin: one value preserves bytes around several token-slice calculations', async () => {
    const { css } = await process(
      'a{b:\\66 oo calc(/*a*/-2px + +5px)  /\\*keep*\\/ MIN(4px,2px)\\9}'
    );
    assert.equal(css, 'a{b:\\66 oo 3px  /\\*keep*\\/ 2px\\9}');
  });

  test('plugin: declaration transformations are idempotent', async () => {
    await assertIdempotent(
      'a{b:calc(1px + 2px) calc(2px + 3px);c:calc(100% + var(--x))}',
      { warnWhenCannotResolve: true }
    );
  });

  test('plugin: removes leading zero from resolved decimals', async () => {
    const { css } = await process('a{b:calc(1px / 4);c:calc(1 / 2000000)}');
    assert.equal(css, 'a{b:.25px;c:calc(5e-7)}');
  });

  test('plugin: preserves fractional unitless results for integer contexts', async () => {
    const { css } = await process(
      'a{z-index:calc(1 / 2);z-index:calc(3 / 2);order:calc(2 / 1);width:calc(1px / 2)}'
    );
    assert.equal(
      css,
      'a{z-index:calc(.5);z-index:calc(1.5);order:2;width:.5px}'
    );
  });

  test('plugin: preserves grouping through unary negation', async () => {
    const { css } = await process(
      'a{a:calc(-(var(--a) + var(--b)));b:calc(-(10px + var(--a)))}'
    );
    assert.equal(
      css,
      'a{a:calc(-(var(--a) + var(--b)));b:calc(-(10px + var(--a)))}'
    );
  });

  test('plugin: preserves grouping for opaque subtraction', async () => {
    const { css } = await process(
      'a{a:calc(5px - (var(--var-1) + var(--var-2)));b:calc(var(--a) - (var(--b) + var(--c)));c:calc(var(--a) - (var(--b) - var(--c)));d:calc(5px - (10px + var(--a)))}'
    );
    assert.equal(
      css,
      'a{a:calc(5px - (var(--var-1) + var(--var-2)));b:calc(var(--a) - (var(--b) + var(--c)));c:calc(var(--a) - (var(--b) - var(--c)));d:calc(5px - (10px + var(--a)))}'
    );
  });

  test('plugin: preserves nested opaque grouping and simplifies var fallbacks', async () => {
    const { css } = await process(
      'a{b:calc(var(--a) - (var(--b) - (var(--c, calc(1px + 2px)) + var(--d))))}'
    );
    assert.equal(
      css,
      'a{b:calc(var(--a) - (var(--b) - (var(--c, 3px) + var(--d))))}'
    );
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
});
