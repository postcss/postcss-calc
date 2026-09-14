import assert from 'node:assert/strict';
import postcss from 'postcss';

const POSTCSS_OPTS = { from: undefined };

export function createPluginTestHarness(plugin) {
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

  return { process, assertIdempotent };
}
