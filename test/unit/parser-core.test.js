// Unit tests for parser.ts — parselet behavior and raw AST shape.
// Distinct from test-simplify: we assert what the PARSER produces,
// before simplify runs. Uses sexpr for compact structural assertions.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenType, tokenize } from '@csstools/css-tokenizer';
import { indexBlocks } from '../../src/lib/block-index.js';
import { parse } from '../../src/lib/parser.js';
import { serialize } from '../../src/lib/serialize.js';
import { sexpr } from '../helpers/sexpr.js';

/** Parse input, return its S-expression. */
const ast = (input) => {
  const tokens = tokenize({ css: input });
  return sexpr(parse(tokens, 0, tokens.length, indexBlocks(tokens)));
};

test('parser: accepts a bounded range of a shared native token stream', () => {
  const tokens = tokenize({ css: 'prefix calc(/* gap */-2px + 3px) suffix' });
  const start = tokens.findIndex((token) => token[1] === '/* gap */');
  const end = tokens.findIndex((token) => token[1] === ')');

  assert.equal(
    sexpr(parse(tokens, start, end, indexBlocks(tokens))),
    '(+ -2px 3px)'
  );
});

test('parser: bounded virtual EOF keeps its source-relative position', () => {
  const tokens = tokenize({ css: 'prefix calc(1 *) suffix' });
  const start = tokens.findIndex((token) => token[1] === '1');
  const end = tokens.findIndex((token) => token[1] === ')');

  assert.throws(
    () => parse(tokens, start, end, indexBlocks(tokens)),
    /position 15/
  );
});

test('parser: bounded virtual EOF scans trailing trivia before reporting its position', () => {
  const tokens = tokenize({ css: 'prefix calc(1 +   ) suffix' });
  const start = tokens.findIndex((token) => token[1] === '1');
  const end = tokens.findIndex((token) => token[1] === ')');

  assert.throws(() => parse(tokens, start, end, indexBlocks(tokens)), {
    message: `Unexpected token "" at position ${tokens[end][2]}`,
  });
});

test('parser: native EOF scans trailing trivia and keeps its exact position', () => {
  const tokens = tokenize({ css: '1 +   ' });
  assert.throws(() => parse(tokens, 0, tokens.length, indexBlocks(tokens)), {
    message: 'Unexpected token "" at position 6',
  });
});

test('parser: bounded range shares block boundaries through var fallbacks', () => {
  const input =
    'prefix calc(var(--x, [calc(1px + 2px), {a: calc(3px + 4px)}], calc(5px + 6px))) suffix';
  const tokens = tokenize({ css: input });
  const start = tokens.findIndex(
    (token) => token[0] === TokenType.Function && token[4].value === 'calc'
  );
  const end = tokens.findLastIndex(
    (token) => token[0] === TokenType.CloseParen
  );

  assert.equal(
    serialize(parse(tokens, start + 1, end, indexBlocks(tokens))),
    'var(--x, [calc(1px + 2px), {a: calc(3px + 4px)}], calc(5px + 6px))'
  );
});

// --- Literal parselets ----------------------------------------------------
describe('parser: values', () => {
  test('parser: bare number', () => {
    assert.equal(ast('42'), '42');
  });

  test('parser: bare dimension', () => {
    assert.equal(ast('10px'), '10px');
  });

  test('parser: bare ident', () => {
    assert.equal(ast('foo'), 'foo');
  });

  test('parser: unit-case normalization happens at parse', () => {
    // Tokenizer stores `PX` verbatim; the dimension parselet lowercases.
    assert.equal(ast('1PX'), '1px');
  });

  test('parser: % is preserved as a unit', () => {
    assert.equal(ast('50%'), '50%');
  });

  test('parser: signed textual zero forms normalize to positive zero', () => {
    for (const source of ['-0', '-.0', '-0e10', '-0px', '-.0E-3%']) {
      const tokens = tokenize({ css: source });
      const leaf = parse(tokens, 0, tokens.length, indexBlocks(tokens));
      assert.ok(leaf.type === 'Num' || leaf.type === 'Dim');
      assert.equal(leaf.value, 0, source);
      assert.equal(Object.is(leaf.value, -0), false, source);
    }
  });
});

// --- Precedence and associativity ----------------------------------------
describe('parser: / precedence and associativity', () => {
  test('parser: * binds tighter than +', () => {
    assert.equal(ast('1 + 2 * 3'), '(+ 1 (* 2 3))');
  });

  test('parser: / binds tighter than +', () => {
    assert.equal(ast('1 + 6 / 2'), '(+ 1 (* 6 (/ 2)))');
  });

  test('parser: left-associative +', () => {
    // n-ary Sum: three sibling terms, not nested binaries.
    assert.equal(ast('1 + 2 + 3'), '(+ 1 2 3)');
  });

  test('parser: left-associative -', () => {
    // mkSum normalizes {-1, Num(2)} → {+1, Num(-2)}, so sexpr shows `-2`
    // directly rather than the (- 2) opaque form.
    assert.equal(ast('1 - 2 - 3'), '(+ 1 -2 -3)');
  });

  test('parser: left-associative *', () => {
    assert.equal(ast('2 * 3 * 4'), '(* 2 3 4)');
  });

  test('parser: mixed + / - flattens to one Sum', () => {
    assert.equal(ast('1 - 2 + 3'), '(+ 1 -2 3)');
  });
});

describe('parser: long arithmetic chains', () => {
  const termCount = 1_024;

  test('parser: long additive chain has one canonical Sum', () => {
    const input = Array(termCount).fill('1').join(' + ');
    const tokens = tokenize({ css: input });
    const tree = parse(tokens, 0, tokens.length, indexBlocks(tokens));

    assert.equal(tree.type, 'Sum');
    assert.equal(tree.terms.length, termCount);
    assert.equal(serialize(tree), `calc(${input})`);
  });

  test('parser: long multiplicative chain has one canonical Product', () => {
    // Use 2 rather than 1: `mkProduct` correctly removes factors of one.
    const input = Array(termCount).fill('2').join(' * ');
    const tokens = tokenize({ css: input });
    const tree = parse(tokens, 0, tokens.length, indexBlocks(tokens));

    assert.equal(tree.type, 'Product');
    assert.equal(tree.factors.length, termCount);
    assert.equal(serialize(tree), `calc(${input})`);
  });
});

// --- Unary + / - prefix ---------------------------------------------------
describe('parser: unary operators', () => {
  test('parser: unary - on Num absorbs into value', () => {
    assert.equal(ast('-5'), '-5');
  });

  test('parser: unary - on Dim absorbs into value', () => {
    assert.equal(ast('-10px'), '-10px');
  });

  test('parser: double unary - cancels', () => {
    // Bare `--5` tokenizes as a single ident per CSS Syntax L3 (leading
    // `-` followed by `-` starts an ident), so use a grouped form to
    // exercise two unary-minus parses.
    assert.equal(ast('-(-5)'), '5');
  });

  test('parser: unary + is a no-op', () => {
    assert.equal(ast('+5'), '5');
  });

  test('parser: unary - on opaque wraps in single-term negative Sum', () => {
    // `-x` tokenizes as one ident per CSS Syntax L3. Parenthesize so the
    // leading `-` lives next to a `(` and stays a punctuator.
    assert.equal(ast('-(x)'), '(+ (- x))');
  });
});

// --- Grouping -------------------------------------------------------------
test('parser: parens override precedence', () => {
  assert.equal(ast('(1 + 2) * 3'), '(* (+ 1 2) 3)');
});

test('parser: nested parens collapse to a single value', () => {
  assert.equal(ast('(((42)))'), '42');
});

// --- Function calls -------------------------------------------------------
describe('parser: function calls', () => {
  test('parser: zero-arg opaque call', () => {
    assert.equal(ast('pi()'), 'OpaqueCall(pi [])');
  });

  test('parser: multi-arg call', () => {
    assert.equal(ast('clamp(0, 5, 10)'), '(clamp 0 5 10)');
  });

  test('parser: call args use full precedence (no escape)', () => {
    assert.equal(ast('min(1 + 2, 3 * 4)'), '(min (+ 1 2) (* 3 4))');
  });

  test('parser: var() preserves custom-property idents', () => {
    assert.equal(ast('var(--x)'), 'OpaqueCall(var [--x])');
  });

  test('parser: calc() wraps its single argument as a Call', () => {
    assert.equal(ast('calc(1 + 2)'), '(calc (+ 1 2))');
  });

  test('parser: native function tokens preserve escaped opaque names', () => {
    const tokens = tokenize({ css: String.raw`f\,n(1px)` });
    const tree = parse(tokens, 0, tokens.length, indexBlocks(tokens));
    assert.equal(serialize(tree), String.raw`f\,n(1px)`);
  });

  test('parser: escaped punctuation stays inside opaque identifiers', () => {
    for (const input of [
      String.raw`var(--kendo-spacing-1\.5)`,
      String.raw`var(--x\,fallback)`,
      String.raw`var(--x\ fallback)`,
    ]) {
      const tokens = tokenize({ css: input });
      assert.equal(
        serialize(parse(tokens, 0, tokens.length, indexBlocks(tokens))),
        input
      );
    }
  });

  test('parser: custom dimension preserves escaped unit spelling', () => {
    const tokens = tokenize({ css: String.raw`10\foo` });
    assert.equal(
      serialize(parse(tokens, 0, tokens.length, indexBlocks(tokens))),
      String.raw`calc(10\foo)`
    );
  });
});

// --- §10.5 exponential function calls round-trip as opaque -------------
describe('parser: exponential functions', () => {
  test('parser: pow(2, 3) parses as Call with two args', () => {
    assert.equal(ast('pow(2, 3)'), '(pow 2 3)');
  });

  test('parser: sqrt(4) parses as Call with one arg', () => {
    assert.equal(ast('sqrt(4)'), '(sqrt 4)');
  });

  test('parser: hypot accepts variable arity', () => {
    assert.equal(ast('hypot(3, 4)'), '(hypot 3 4)');
    assert.equal(ast('hypot(1, 2, 3)'), '(hypot 1 2 3)');
  });

  test('parser: log accepts one or two args', () => {
    assert.equal(ast('log(8, 2)'), '(log 8 2)');
    assert.equal(ast('log(8)'), '(log 8)');
  });

  test('parser: exp(1) parses as Call', () => {
    assert.equal(ast('exp(1)'), '(exp 1)');
  });
});
