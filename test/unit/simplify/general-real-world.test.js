import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from '../../helpers/out.js';

// --- Real-world: non-ASCII custom-property names ------------------------
test('round-trip: var(--φ) (Greek phi) preserves the identifier', () => {
  assert.equal(out('calc(var(--φ))'), 'var(--φ)');
});

test('round-trip: var(--φ) inside arithmetic', () => {
  assert.equal(out('calc(1px * var(--φ))'), 'calc(1px * var(--φ))');
});

// --- Real-world: /* */ comments inside calc -----------------------------
test('comments: are skipped inside calc and constants still fold', () => {
  assert.equal(out('calc(10px /* gap */ + 5px)'), '15px');
});

test('comments: leading and trailing comments do not affect output', () => {
  assert.equal(out('calc(/* a */ 10px /* b */ + /* c */ 5px /* d */)'), '15px');
});

// --- Real-world: anchor() / anchor-size() opaque round-trip -----------
test('anchor: bare anchor() round-trips with space-separated args', () => {
  assert.equal(out('anchor(--foo top)'), 'anchor(--foo top)');
});

describe('anchor: Anchor(implicit Bottom', () => {
  test('anchor: anchor(implicit bottom) round-trips', () => {
    assert.equal(out('anchor(implicit bottom)'), 'anchor(implicit bottom)');
  });

  test('anchor: composes inside calc() with surrounding arithmetic', () => {
    // Sum canonicalization sorts the constant first; both forms are
    // semantically identical.
    assert.equal(
      out('calc(anchor(--foo top) - 42px)'),
      'calc(-42px + anchor(--foo top))'
    );
  });
});

test('anchor-size: anchor-size(--foo height) round-trips', () => {
  assert.equal(out('anchor-size(--foo height)'), 'anchor-size(--foo height)');
});
