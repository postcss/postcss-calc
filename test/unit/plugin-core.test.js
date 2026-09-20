// Plugin-level tests for src/plugin/plugin.ts. Exercises the
// PostCSS adapter, option wiring, and error reporting behavior.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import plugin from '../../src/index.js';
import { createPluginTestHarness } from '../helpers/plugin.js';

const { process, assertIdempotent } = createPluginTestHarness(plugin);
// --- Basic pipeline ------------------------------------------------------
describe('plugin: basic pipeline', () => {
  test('plugin: reduces simple calc in a decl', async () => {
    const { css } = await process('a{b:calc(1px + 2px)}');
    assert.equal(css, 'a{b:calc(3px)}');
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

  test('plugin: does not partially rewrite a nested calc in an unclosed calc', async () => {
    const value = 'calc(1px + calc(1px + 1px)';
    // PostCSS rejects this malformed value while parsing source text, so put
    // it into an already-parsed declaration to exercise the adapter.
    const root = postcss.parse('a{b:0}');
    root.first.first.value = value;
    const result = await postcss(plugin()).process(root, { from: undefined });
    assert.equal(result.root.first.first.value, value);
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
    assert.equal(
      css,
      'a{a:calc(3px);b:calc(8%);c:calc(.25);d:calc(-1px);e:calc(3px)}'
    );
  });

  test('plugin: negative scalar results retain calc()', async () => {
    const { css } = await process('a{width:calc(5px - 10px)}');
    assert.equal(css, 'a{width:calc(-5px)}');
  });

  test('plugin: rounded negative floating-point noise does not retain calc()', async () => {
    const { css } = await process('a{width:calc(cos(270deg) * 100px)}');
    assert.equal(css, 'a{width:calc(0px)}');
    const unrounded = await process('a{width:calc(cos(270deg) * 100px)}', {
      precision: false,
    });
    assert.equal(unrounded.css, 'a{width:calc(-1.8369701987210297e-14px)}');
  });

  test('plugin: multiple calcs in one value', async () => {
    const { css } = await process('a{b:calc(1px + 1px) calc(2px + 2px)}');
    assert.equal(css, 'a{b:calc(2px) calc(4px)}');
  });

  test('plugin: one value preserves bytes around several token-slice calculations', async () => {
    const { css } = await process(
      'a{b:\\66 oo calc(/*a*/-2px + +5px)  /\\*keep*\\/ MIN(4px,2px)\\9}'
    );
    assert.equal(css, 'a{b:\\66 oo calc(3px)  /\\*keep*\\/ calc(2px)\\9}');
  });

  test('plugin: declaration transformations are idempotent', async () => {
    await assertIdempotent(
      'a{b:calc(1px + 2px) calc(2px + 3px);c:calc(100% + var(--x))}',
      { warnWhenCannotResolve: true }
    );
  });

  test('plugin: removes leading zero from resolved decimals', async () => {
    const { css } = await process('a{b:calc(1px / 4);c:calc(1 / 2000000)}');
    assert.equal(css, 'a{b:calc(.25px);c:calc(5e-7)}');
  });

  test('plugin: preserves fractional unitless results for integer contexts', async () => {
    const { css } = await process(
      'a{z-index:calc(1 / 2);z-index:calc(3 / 2);order:calc(2 / 1);width:calc(1px / 2)}'
    );
    assert.equal(
      css,
      'a{z-index:calc(.5);z-index:calc(1.5);order:calc(2);width:calc(.5px)}'
    );
  });

  test('plugin: preserves the unparsable unary minus form byte-for-byte', async () => {
    // `-(...)` is invalid CSS math syntax; the plugin must not repair it.
    const { css } = await process(
      'a{a:calc(-(var(--a) + var(--b)));b:calc(-(10px + var(--a)))}'
    );
    assert.equal(
      css,
      'a{a:calc(-(var(--a) + var(--b)));b:calc(-(10px + var(--a)))}'
    );
  });

  test('plugin: preserves the unparsable unary plus form byte-for-byte', async () => {
    // `+(...)` is invalid CSS math syntax; the plugin must not repair it.
    const { css } = await process(
      'a{a:calc(+(10px + 20px));b:calc(+var(--x))}'
    );
    assert.equal(css, 'a{a:calc(+(10px + 20px));b:calc(+var(--x))}');
  });

  test('plugin: preserves grouping through explicit -1 multiplication', async () => {
    const { css } = await process(
      'a{a:calc((var(--a) + var(--b)) * -1);b:calc(-1 * (10px + var(--a)))}'
    );
    assert.equal(
      css,
      'a{a:calc(-1 * (var(--a) + var(--b)));b:calc(-1 * (10px + var(--a)))}'
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
      'a{b:calc(var(--a) - (var(--b) - (var(--c, calc(3px)) + var(--d))))}'
    );
  });

  test('plugin: vendor-prefix calcs get the same simplification', async () => {
    const { css } = await process('a{b:-webkit-calc(1px + 2px)}');
    // Round-trip preserves the prefix via serialize's calcName option.
    assert.equal(css, 'a{b:-webkit-calc(3px)}');
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
