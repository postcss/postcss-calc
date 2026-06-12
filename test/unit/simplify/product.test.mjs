import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.mjs';
test('simplify: dim * number', () => {
  assert.equal(out('calc(3em * 2)'), '6em');
  assert.equal(out('calc(2 * 3em)'), '6em');
});
test('simplify: dim / number', () => {
  assert.equal(out('calc(10px / 2)'), '5px');
});
test('simplify: number * number', () => {
  assert.equal(out('calc(3 * 4)'), '12');
});
test('simplify: number / number', () => {
  assert.equal(out('calc(10 / 4)'), '2.5');
});
test('simplify: dim * dim preserved (unit^2 not expressible)', () => {
  assert.equal(out('calc(2px * 3px)'), 'calc(2px * 3px)');
});
test('simplify: distributes number into a sum', () => {
  // not the spec's required behavior, but a natural consequence of folding
  // after a product — proves we fold where we can.
  assert.equal(out('calc((1 + 2) * 3px)'), '9px');
});
test('simplify: distributes through a sum whose terms mix Num and Dim', () => {
  // The distribution guard accepts `(t.node.type === 'Num' ||
  // t.node.type === 'Dim')` for every term — exercises both arms with a
  // single test case (1 is Num, 1px is Dim).
  assert.equal(out('calc(2 * (1 + 1px))'), 'calc(2 + 2px)');
});
test('simplify: does not distribute when a remaining dim factor is present', () => {
  // 2px is a remaining dim factor; the inner sum (1 + 1em) is foldable
  // (every term is Num or Dim) so the distribution guard checks
  // remainingDims.length === 0 to avoid losing 2px from the product.
  // Without the guard the simplifier would distribute coeff=1 into the
  // sum and drop 2px entirely.
  assert.equal(out('calc(2px * (1 + 1em))'), 'calc(2px * (1 + 1em))');
});
test('simplify: does not distribute through a denominator sum', () => {
  // The opaque sum sits in denominator position (exponent === -1). The
  // distribution guard checks `opaque[0].exponent === 1` so we don't
  // emit `2px + 2em` when the input was `2 / (1px + 1em)`.
  assert.equal(out('calc(2 / (1px + 1em))'), 'calc(2 / (1px + 1em))');
});
test('simplify: chained multiplication folds left-to-right', () => {
  assert.equal(out('calc(2 * 3 * 4px)'), '24px');
});
test('simplify: mixed * and / chain at the same precedence (left-assoc)', () => {
  // 2 * 3 / 4 * 5 = (((2 * 3) / 4) * 5) = 7.5
  assert.equal(out('calc(2 * 3 / 4 * 5)'), '7.5');
});
// <T> / <T> → <number> when both sides reduce to the same base type and the
// units are statically convertible within that type's conversion family.
test('typed div: px / px → unitless', () => {
  assert.equal(out('calc(10px / 2px)'), '5');
});
test('typed div: in / px → unitless (cross-unit)', () => {
  assert.equal(out('calc(1in / 48px)'), '2');
});
test('typed div: cm / mm → unitless', () => {
  assert.equal(out('calc(1cm / 5mm)'), '2');
});
test('typed div: s / ms → unitless', () => {
  assert.equal(out('calc(1s / 100ms)'), '10');
});
test('typed div: Hz / kHz → unitless', () => {
  assert.equal(out('calc(1000hz / 1khz)'), '1');
});
test('typed div: deg / deg → unitless', () => {
  assert.equal(out('calc(180deg / 180deg)'), '1');
});
test('typed div: relative unit (vw) not statically convertible, preserved', () => {
  assert.equal(out('calc(100vw / 1px)'), 'calc(100vw / 1px)');
});
// (Cross-base preservation `10px / 1s` is exercised by the cancel tests
//  below; same-base non-convertible by the em/px cancel test.)
// Numeric coefficient × fully-resolvable Sum distributes into each term.
// When the Sum contains any opaque term, we preserve the factored form
// (spec doesn't require distribution into unresolved subtrees).
test('distribute: number × resolvable-sum folds through each term', () => {
  assert.equal(out('calc(0.5 * (100vw - 10px))'), 'calc(50vw - 5px)');
});
test('distribute: preserves negative signs across each term', () => {
  assert.equal(out('calc(2 * (1em - 3em))'), '-4em');
});
test('distribute: distribute-then-merge same-unit results', () => {
  // 3 * (1em + 2em) = 3em + 6em → merge → 9em.
  assert.equal(out('calc(3 * (1em + 2em))'), '9em');
});
test('distribute: preserved when Sum contains an opaque term', () => {
  // `var(--a)` blocks the fully-resolvable condition; output keeps the
  // factored Product × Sum shape.
  const r = out('calc(2 * (var(--a) + 4px))');
  assert.match(r, /var\(--a\)/);
  assert.match(r, /4px/);
});
test('distribute: cross-unit resolvable-sum still distributes', () => {
  assert.equal(out('calc(2 * (1px + 1px))'), '4px');
});
test('distribute: coefficient 1 is a no-op (mkProduct drops factor of 1)', () => {
  assert.equal(out('calc(1 * (2px + 3px))'), '5px');
});
test('distribute: coefficient on the left or right — both work', () => {
  assert.equal(out('calc((1px + 2px) * 3)'), '9px');
  assert.equal(out('calc(3 * (1px + 2px))'), '9px');
});
test('distribute: nested distribution chains', () => {
  // ((1 + 2) * 3px) = 9px, already exercised; deeper case:
  // 2 * (1 + 2) * 3px — two multipliers fold first, then distribute.
  assert.equal(out('calc(2 * (1 + 2) * 3px)'), '18px');
});
test('div by zero: 1 / 0 → calc(infinity)', () => {
  assert.equal(out('calc(1 / 0)'), 'calc(infinity)');
});
test('div by zero: -1 / 0 → calc(-infinity)', () => {
  assert.equal(out('calc(-1 / 0)'), 'calc(-infinity)');
});
test('div by zero: 0 / 0 → calc(NaN)', () => {
  assert.equal(out('calc(0 / 0)'), 'calc(NaN)');
});
test('div by zero: 1px / 0 → calc(infinity * 1px)', () => {
  assert.equal(out('calc(1px / 0)'), 'calc(infinity * 1px)');
});
test('div by zero: 1px / (2 - 2) → calc(infinity * 1px)', () => {
  assert.equal(out('calc(1px / (2 - 2))'), 'calc(infinity * 1px)');
});
test('arithmetic: 1 / infinity → 0', () => {
  assert.equal(out('calc(1 / infinity)'), '0');
});
test('arithmetic: infinity * 0 → NaN', () => {
  // 0 * Infinity is NaN per IEEE-754.
  assert.equal(out('calc(infinity * 0)'), 'calc(NaN)');
});
test('arithmetic: infinity + 1 → infinity', () => {
  assert.equal(out('calc(infinity + 1)'), 'calc(infinity)');
});
test('arithmetic: infinity - infinity → NaN', () => {
  assert.equal(out('calc(infinity - infinity)'), 'calc(NaN)');
});
test('arithmetic: NaN contagion in sum', () => {
  assert.equal(out('calc(NaN + 5)'), 'calc(NaN)');
});
test('arithmetic: NaN * 1px → calc(NaN * 1px)', () => {
  assert.equal(out('calc(NaN * 1px)'), 'calc(NaN * 1px)');
});
test('arithmetic: -infinity * 1px → calc(-infinity * 1px)', () => {
  // -infinity parses as unary-minus around Num(Infinity); product folds to
  // Dim(-Infinity, px).
  assert.equal(out('calc(-infinity * 1px)'), 'calc(-infinity * 1px)');
});
