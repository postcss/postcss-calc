import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '@csstools/css-tokenizer';
import { indexBlocks } from '../../src/lib/block-index.js';
import { parse } from '../../src/lib/parser.js';
import { serialize } from '../../src/lib/serialize.js';
import { parseSource, parseSexpr as ast } from '../helpers/parse-source.js';

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
// --- Calc-keyword folding -------------------------------------------------
test('parser: `pi` folds to Math.PI', () => {
  assert.equal(ast('pi'), String(Math.PI));
});
test('parser: `e` folds to Math.E', () => {
  assert.equal(ast('e'), String(Math.E));
});
test('parser: `infinity` folds to Infinity', () => {
  assert.equal(ast('infinity'), 'Infinity');
});
test('parser: calc-keywords are case-insensitive except NaN', () => {
  assert.equal(ast('PI'), String(Math.PI));
  assert.equal(ast('Infinity'), 'Infinity');
});
test('parser: lowercase `nan` is NOT the keyword (case-sensitive)', () => {
  // Spec: `NaN` is the only case-sensitive calc keyword. `nan` as
  // lowercase is just an opaque identifier.
  assert.equal(ast('nan'), 'nan');
});
// --- Strict whitespace around +/- ----------------------------------------
test('parser: `1px + 2px` is valid', () => {
  assert.doesNotThrow(() => parseSource('1px + 2px'));
});
test('parser: a signed token after whitespace still fails at its position', () => {
  assert.throws(() => parseSource('1 +2'), {
    message: '"+" must be surrounded by whitespace at position 2',
  });
});
test('parser: a unary plus after multiplication has the canonical AST', () => {
  assert.deepEqual(parseSource('1 * +2'), {
    type: 'Num',
    value: 2,
  });
});
// §10.1: `+` and `-` must be surrounded by whitespace. All three asymmetric
// cases (no/before-only/after-only) must throw the same way.
for (const input of ['1px+2px', '1px +2px', '1px+ 2px']) {
  test(`parser: \`${input}\` throws (asymmetric whitespace around +)`, () => {
    assert.throws(() => parseSource(input), /must be surrounded by whitespace/);
  });
}
test('parser: asymmetric additive whitespace reports the operator position', () => {
  for (const [input, position] of [
    ['1px+2px', 3],
    ['1px +2px', 4],
    ['1px+ 2px', 3],
  ]) {
    assert.throws(() => parseSource(input), {
      message: `"+" must be surrounded by whitespace at position ${position}`,
    });
  }
});
test('parser: * / do not require whitespace (spec allows both)', () => {
  const productTokens = tokenize({ css: '1px*2' });
  assert.doesNotThrow(() =>
    parse(productTokens, 0, productTokens.length, indexBlocks(productTokens))
  );
  const quotientTokens = tokenize({ css: '1px/2' });
  assert.doesNotThrow(() =>
    parse(quotientTokens, 0, quotientTokens.length, indexBlocks(quotientTokens))
  );
});
test('parser: tab / newline satisfy the §10.1 whitespace rule', () => {
  assert.equal(ast('1\t+\n2'), '(+ 1 2)');
  assert.equal(ast('1\n-\t2'), '(+ 1 -2)');
});
test('parser: comments satisfy the §10.1 whitespace rule', () => {
  assert.equal(ast('1px/* gap */+/* gap */2px'), '(+ 1px 2px)');
  assert.equal(ast('/* gap */1px + 2px'), '(+ 1px 2px)');
});
test('parser: lookahead preserves comment-derived whitespace when consumed', () => {
  assert.equal(ast('1 /* before */ + /* after */ 2'), '(+ 1 2)');
  assert.equal(ast('1 /* before */ - /* after */ 2'), '(+ 1 -2)');
});

describe('Error positions', () => {
  test('parser: trailing operator throws (whitespace-before-EOF fails)', () => {
    // `1 +` has space before `+` but nothing after — EOF has ws=false, so
    // the strict-whitespace check fires before the unexpected-token path.
    assert.throws(
      () => parseSource('1 +'),
      /must be surrounded by whitespace|Unexpected token/
    );
  });
  test('parser: unclosed paren expects )', () => {
    assert.throws(() => parseSource('(1 + 2'), /Expected/);
  });
  test('parser: stacked operators throw', () => {
    assert.throws(() => parseSource('1 * * 2'), /Unexpected token/);
  });
});

// --- expect() failures (unclosed groups) -----------------------------------
test('parser: unclosed paren throws with expected-token message', () => {
  assert.throws(() => parseSource('(1 + 2'), /Expected \)/);
});

test('parser: unclosed call throws with expected-token message', () => {
  assert.throws(() => parseSource('min(1, 2'), /Expected \)/);
});

test('parser: unclosed var throws with unclosed message and position', () => {
  const tokens = tokenize({ css: 'var(--foo' });
  assert.throws(
    () => parse(tokens, 0, tokens.length, indexBlocks(tokens)),
    /Unclosed var\( at position 4/
  );
});

describe('Trailing tokens', () => {
  // --- Trailing tokens ------------------------------------------------------
  test('parse: rejects input with trailing tokens after a complete expression', () => {
    assert.throws(() => parseSource('1 2'), /Unexpected token/);
  });
  test('parse: empty input throws', () => {
    assert.throws(() => parseSource(''), /Unexpected token/);
  });

  test('parser: punctuation helper methods match and expect punctuation tokens', () => {
    assert.equal(ast('1 + 2 + 3 + 4'), '(+ 1 2 3 4)');
    assert.equal(ast('2 * 3 * 4 * 5'), '(* 2 3 4 5)');
    assert.equal(ast('min(1, 2, 3)'), '(min 1 2 3)');
  });

  test('parser: var() and opaque calls resume outer parsing after block skipping', () => {
    assert.equal(
      ast('calc(var(--x, 1px) + 2px)'),
      '(calc (+ OpaqueCall(var [--x ", 1px"]) 2px))'
    );
    assert.equal(
      ast('calc(var(--x, 1px) - 2px)'),
      '(calc (+ OpaqueCall(var [--x ", 1px"]) -2px))'
    );
    assert.equal(
      ast('calc(unknown(1px + 2px) + 3px)'),
      '(calc (+ OpaqueCall(unknown ["1px + 2px"]) 3px))'
    );
    assert.equal(
      ast('calc(unknown(1px + 2px) - 3px)'),
      '(calc (+ OpaqueCall(unknown ["1px + 2px"]) -3px))'
    );
  });

  test('parser: skipped blocks do not hide trailing tokens', () => {
    const varTokens = tokenize({ css: 'var(--x) 1px' });
    assert.throws(
      () => parse(varTokens, 0, varTokens.length, indexBlocks(varTokens)),
      /Unexpected token/
    );
    const unknownTokens = tokenize({ css: 'unknown(1px + 2px) 3px' });
    assert.throws(
      () =>
        parse(
          unknownTokens,
          0,
          unknownTokens.length,
          indexBlocks(unknownTokens)
        ),
      /Unexpected token/
    );
  });
});
