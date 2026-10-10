import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '@csstools/css-tokenizer';
import { indexBlocks } from '../../src/lib/block-index.js';
import { parse } from '../../src/lib/parser.js';
import { serialize } from '../../src/lib/serialize.js';
import { parseSource } from '../helpers/parse-source.js';

// --- Opaque non-math functions -------------------------------------------
//
// Non-math functions use CSS component-value syntax rather than the math
// grammar. Keeping all of them opaque avoids a name allowlist that must be
// updated for every future CSS function.
describe('parser: opaque expressions and invalid syntax', () => {
  test('parser: anchor() with `<name> <side>` parses as opaque single arg', () => {
    assert.equal(
      serialize(parseSource('anchor(--foo top)')),
      'anchor(--foo top)'
    );
  });

  test('parser: anchor() with `implicit <side>` keyword name', () => {
    assert.equal(
      serialize(parseSource('anchor(implicit bottom)')),
      'anchor(implicit bottom)'
    );
  });

  test('parser: anchor() with comma-separated fallback', () => {
    assert.equal(
      serialize(parseSource('anchor(--foo top, 50px)')),
      'anchor(--foo top, 50px)'
    );
  });

  test('parser: anchor-size() also takes space-separated args', () => {
    assert.equal(
      serialize(parseSource('anchor-size(--foo height)')),
      'anchor-size(--foo height)'
    );
  });

  test('parser: anchor() composes inside calc() arithmetic', () => {
    assert.equal(
      serialize(parseSource('calc(anchor(--foo top) - 42px)')),
      'calc(anchor(--foo top) - 42px)'
    );
  });

  test('parser: anchor() with single side keyword', () => {
    assert.equal(serialize(parseSource('anchor(top)')), 'anchor(top)');
  });

  test('parser: anchor arguments preserve escaped lexical spelling', () => {
    const input = String.raw`anchor(--x\ top left)`;
    assert.equal(serialize(parseSource(input)), input);
  });

  test('parser: arbitrary non-math function contents stay opaque', () => {
    for (const input of [
      'attr(size ch)',
      'future-fn("x", [a b] {c: #fff})',
      'unknown(1px + 2px)',
    ]) {
      assert.equal(serialize(parseSource(input)), input);
    }
  });

  test('parser: opaque calls expose their component trees', () => {
    const varTokens = tokenize({ css: 'var(--x, 1px)' });
    assert.deepEqual(
      parse(varTokens, 0, varTokens.length, indexBlocks(varTokens)),
      {
        type: 'OpaqueCall',
        name: 'var',
        components: [{ type: 'Ident', name: '--x' }, ', 1px'],
      }
    );
    const unknownTokens = tokenize({ css: 'unknown(1px + 2px)' });
    assert.deepEqual(
      parse(unknownTokens, 0, unknownTokens.length, indexBlocks(unknownTokens)),
      {
        type: 'OpaqueCall',
        name: 'unknown',
        components: ['1px + 2px'],
      }
    );
  });

  test('parser: opaque component trees retain nested math ASTs', () => {
    const node = parseSource('unknown(calc(1px + 2px))');
    assert.equal(node.type, 'OpaqueCall');
    if (node.type === 'OpaqueCall') {
      assert.equal(node.components.length, 1);
      const component = node.components[0];
      assert.equal(
        typeof component === 'object' && !Array.isArray(component)
          ? component.type
          : null,
        'Call'
      );
    }
  });

  test('parser: opaque trees preserve raw and nested component structure', () => {
    const input = String.raw`f( /*lead*/ \66 oo\20 bar, raw([x, y], {z: q}), c\61 lc(1px + var(--x)), calc(1PX+2PX), calc(-(var(--x) + 1px)) )`;
    const node = parseSource(input);

    assert.deepEqual(node, {
      type: 'OpaqueCall',
      name: 'f',
      components: [
        String.raw` /*lead*/ \66 oo\20 bar, raw(`,
        ['[', ['x, y'], '], {', ['z: q'], '}'],
        '), ',
        {
          type: 'Call',
          name: 'calc',
          rawName: String.raw`c\61 lc`,
          args: [
            {
              type: 'Sum',
              terms: [
                { sign: 1, node: { type: 'Dim', value: 1, unit: 'px' } },
                {
                  sign: 1,
                  node: {
                    type: 'OpaqueCall',
                    name: 'var',
                    components: [{ type: 'Ident', name: '--x' }],
                  },
                },
              ],
            },
          ],
        },
        ', calc(1PX+2PX), calc(-(var(--x) + 1px)) ',
      ],
    });
    // `calc(-( ... ))` has no unary-minus production, so the nested calc()
    // degrades to raw opaque text and round-trips byte-for-byte.
    assert.equal(serialize(node), input);
  });

  test('parser: unclosed anchor() throws', () => {
    assert.throws(() => parseSource('anchor(--foo top'), /Unclosed anchor\(/);
  });
});
