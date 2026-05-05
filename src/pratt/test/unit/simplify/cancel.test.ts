import { test } from 'node:test';
import assert from 'node:assert/strict';

import { out } from '../../helpers/out.ts';

test('cancel: 3 same-base dims in a product can`t be 2-factor-cancelled', () => {
  // tryCancelPair only handles exactly 2 dims. 3 → bail, preserve.
  const r = out('calc(10px * 2px / 1px)');
  assert.match(r, /10px/);
  assert.match(r, /2px/);
  assert.match(r, /1px/);
});

test('cancel: same-base same-exponent pair can`t cancel (no numerator/denominator split)', () => {
  // Both are numerators — `2px * 3px` — not a numerator/denominator pair.
  assert.equal(out('calc(2px * 3px)'), 'calc(2px * 3px)');
});

test('cancel: non-convertible same-base pair preserves', () => {
  // em/px both length; em isn't statically convertible, so division preserves.
  assert.equal(out('calc(2em / 1px)'), 'calc(2em / 1px)');
});
