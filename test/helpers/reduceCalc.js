import assert from 'node:assert/strict';

export function createReduceCalcTestHarness(reducer) {
  function reduceWithWarnings(value, opts = {}) {
    const warnings = [];
    const output = reducer(value, {
      ...opts,
      onWarn: (message) => {
        warnings.push(message);
        opts.onWarn?.(message);
      },
    });
    return { output, warnings };
  }

  function assertIdempotent(value, opts = {}) {
    const first = reduceWithWarnings(value, opts);
    const second = reduceWithWarnings(first.output, opts);

    assert.notEqual(first.output, value);
    assert.equal(second.output, first.output);
    assert.deepEqual(second.warnings, first.warnings);
  }

  return { reduceWithWarnings, assertIdempotent };
}
