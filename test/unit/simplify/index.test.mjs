import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';
// --- calc() flattening (§10.10) -------------------------------------------
test('simplify: bare calc() unwraps to its single value', () => {
  assert.equal(out('calc(42px)'), '42px');
});
test('simplify: nested calc() collapses', () => {
  assert.equal(out('calc(calc(1px + 2px))'), '3px');
});
// Note: `-webkit-calc(...)` and `-moz-calc(...)` vendor wrappers come in
// pre-stripped from the PostCSS value layer in production. At the parser
// level, the leading `-` would read as unary minus, so we don't exercise
// those forms here — the production adapter unwraps them before we see the
// expression contents.
// --- Calc keywords (§10.9) ------------------------------------------------
test('simplify: pi folds to a number', () => {
  assert.equal(out('calc(pi)'), '3.14159');
});
test('simplify: e folds to a number', () => {
  assert.equal(out('calc(e)'), '2.71828');
});
test('simplify: pi in a product with a unit', () => {
  assert.equal(out('calc(pi * 1rad)'), '3.14159rad');
});
test('simplify: calc-keyword names are case-insensitive except NaN', () => {
  assert.equal(out('calc(PI)'), '3.14159');
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
test('simplify: -0 collapses to 0 (mkSum drops zero-valued Num)', () => {
  // `-0` parses as unary-minus applied to Num(0); negate(Num(0)) is Num(-0)
  // which JavaScript prints as "0". The constructor's drop-zero rule
  // treats both +0 and -0 the same.
  assert.equal(out('calc(-0)'), '0');
  assert.equal(out('calc(0 - 0)'), '0');
});
