import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import postcss from 'postcss';
const require = createRequire(import.meta.url);

const reduceCalc = (opts = {}) => require('../../src/index.js')(opts);

const postcssOpts = { from: undefined };
export function testValue(fixture, expected, opts = {}) {
  fixture = `foo{bar:${fixture}}`;
  expected = `foo{bar:${expected}}`;

  return async () => {
    const result = await postcss(reduceCalc(opts)).process(
      fixture,
      postcssOpts
    );
    assert.strictEqual(result.css, expected);
  };
}
