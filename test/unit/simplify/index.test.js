import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.js';
import { tokenize } from '@csstools/css-tokenizer';
import { indexBlocks } from '../../../src/lib/block-index.js';
import { parse } from '../../../src/lib/parser.js';
import { simplify } from '../../../src/lib/simplify.js';

// --- calc() flattening (§10.10) -------------------------------------------
test('simplify: bare calc() preserves single value wrapped in calc()', () => {
  assert.equal(out('calc(42px)'), 'calc(42px)');
});

test('simplify: nested calc() collapses', () => {
  assert.equal(out('calc(calc(1px + 2px))'), 'calc(3px)');
});

// Note: `-webkit-calc(...)` and `-moz-calc(...)` vendor wrappers come in
// pre-stripped from the PostCSS value layer in production. At the parser
// level, the leading `-` would read as unary minus, so we don't exercise
// those forms here — the production adapter unwraps them before we see the
// expression contents.
// --- Calc keywords (§10.9) ------------------------------------------------
test('simplify: pi folds to a number', () => {
  assert.equal(out('calc(pi)'), 'calc(3.14159)');
});

describe('simplify: math constants and non-finite values', () => {
  test('simplify: e folds to a number', () => {
    assert.equal(out('calc(e)'), 'calc(2.71828)');
  });

  test('simplify: pi in a product with a unit', () => {
    assert.equal(out('calc(pi * 1rad)'), 'calc(3.14159rad)');
  });

  test('simplify: calc-keyword names are case-insensitive except NaN', () => {
    assert.equal(out('calc(PI)'), 'calc(3.14159)');
    assert.equal(out('calc(Infinity)'), 'calc(infinity)');
    // `nan` lowercase is treated as a plain ident (opaque), not the keyword
    assert.equal(out('calc(nan)'), 'nan');
  });

  test('simplify: NaN propagates through arithmetic', () => {
    // IEEE-754: NaN + anything = NaN. Per §10.13 the canonical top-level
    // form is `calc(NaN)`.
    assert.equal(out('calc(NaN + 1)'), 'calc(NaN)');
    assert.equal(out('calc(NaN)'), 'calc(NaN)');
  });

  test('simplify: source signed zero normalizes before evaluation', () => {
    const sourceZeroTokens = tokenize({ css: 'calc(-0)' });
    const sourceZero = simplify(
      parse(
        sourceZeroTokens,
        0,
        sourceZeroTokens.length,
        indexBlocks(sourceZeroTokens)
      )
    );
    assert.equal(sourceZero.type, 'Num');
    assert.equal(Object.is(sourceZero.value, -0), false);

    const positiveZeroTokens = tokenize({ css: 'calc(0 - 0)' });
    const positiveZero = simplify(
      parse(
        positiveZeroTokens,
        0,
        positiveZeroTokens.length,
        indexBlocks(positiveZeroTokens)
      )
    );
    assert.equal(positiveZero.type, 'Num');
    assert.equal(Object.is(positiveZero.value, -0), false);

    // Top-level scalar serialization is ordinary zero in both cases.
    assert.equal(out('calc(-0)'), 'calc(0)');
    assert.equal(out('calc(0 - 0)'), 'calc(0)');
  });
});
