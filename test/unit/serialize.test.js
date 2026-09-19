import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serialize as serializeSource,
  serializeResult as serializeResultSource,
} from '../../src/lib/serialize.js';
import {
  num,
  dim,
  call,
  opaqueCall,
  ident,
  mkSum,
  mkProduct,
} from '../../src/lib/node.js';
import { tokenize } from '@csstools/css-tokenizer';
import { indexBlocks } from '../../src/lib/block-index.js';
import { parse } from '../../src/lib/parser.js';
import { simplify } from '../../src/lib/simplify.js';

const serialize = (node, opts = {}) => serializeSource(node, opts);
const serializeResult = (result, opts = {}) =>
  serializeResultSource(result, opts);

/** @param {number} depth */
function nestedOpaque(depth) {
  let tree = ident('--x');
  for (let i = 0; i < depth; i++) tree = opaqueCall('var', [tree]);
  return tree;
}

/** @param {import('../../src/lib/node.js').Node} tree */
function serializeResultInput(tree) {
  return {
    tree,
    status: /** @type {'resolved'} */ ('resolved'),
    rootName: 'calc',
    rootSpelling: 'calc',
    original: 'calc(var(--x))',
  };
}

// Direct serialize() tests — build canonical AST nodes by hand to pin
// output shape without depending on the parser/simplify.
// Signed-leaf canonical form: negatives live directly in the Num/Dim value.

describe('serialize: numbers', () => {
  test('serialize: single number uses standard calculation syntax', () => {
    assert.equal(serialize(num(42)), 'calc(42)');
  });

  test('serialize: single dimension uses standard calculation syntax', () => {
    assert.equal(serialize(dim(10, 'px')), 'calc(10px)');
  });

  test('serialize: sum wrapped in calc(), spaces around +/-', () => {
    const ast = mkSum([
      { sign: 1, node: dim(1, 'px') },
      { sign: 1, node: dim(2, 'px') },
    ]);
    assert.equal(serialize(ast), 'calc(1px + 2px)');
  });

  test('serialize: spaces around every binary operator', () => {
    const ast = mkProduct([
      { exponent: 1, node: num(2) },
      { exponent: 1, node: dim(3, 'px') },
    ]);
    assert.equal(serialize(ast), 'calc(2 * 3px)');
  });

  test('serialize: self-wrapping call — no extra calc()', () => {
    const ast = {
      type: 'Call',
      name: 'min',
      args: [dim(1, 'px'), dim(2, 'px')],
    };
    assert.equal(serialize(ast), 'min(1px, 2px)');
  });

  test('serialize: var() call', () => {
    const ast = opaqueCall('var', [ident('--x')]);
    assert.equal(serialize(ast), 'var(--x)');
  });

  test('serialize: Sum inside Product gets parens', () => {
    // (1 + 2) * 3 — the Sum as a factor must be parenthesized.
    const innerSum = mkSum([
      { sign: 1, node: num(1) },
      { sign: 1, node: num(2) },
    ]);
    const ast = mkProduct([
      { exponent: 1, node: innerSum },
      { exponent: 1, node: num(3) },
    ]);
    assert.equal(serialize(ast), 'calc((1 + 2) * 3)');
  });

  test('serialize: negative Dim via signed leaf → calc(-Xpx)', () => {
    // Negatives live directly in the Dim value. The constructor helper
    // `dim(-1, 'px')` returns a Dim with value -1, no Sum wrapper.
    assert.equal(serialize(dim(-1, 'px')), 'calc(-1px)');
  });

  test('serialize: single-term Sum with opaque gets calc() function', () => {
    // `-var(--x)` needs calc() so the leading minus isn't ambiguous.
    const ast = mkSum([
      {
        sign: -1,
        node: opaqueCall('var', [ident('--x')]),
      },
    ]);
    assert.equal(serialize(ast), 'calc(-var(--x))');
  });

  test('serialize: precision option applied to numbers and dimensions', () => {
    assert.equal(
      serialize(dim(1.123456789, 'px'), { precision: 2 }),
      'calc(1.12px)'
    );
    assert.equal(serialize(num(1.123456789), { precision: 0 }), 'calc(1)');
    assert.equal(serialize(num(1.4), { precision: 0 }), 'calc(1)');
    assert.equal(serialize(num(1.4), { precision: 1 }), 'calc(1.4)');
  });

  test('serialize: precision false keeps full value', () => {
    assert.equal(
      serialize(dim(1.123456789, 'px'), { precision: false }),
      'calc(1.123456789px)'
    );
    assert.equal(
      serialize(num(1 / 3), { precision: false }),
      'calc(.3333333333333333)'
    );
    assert.equal(
      serialize(dim(1 / 3, 'px'), { precision: false }),
      'calc(.3333333333333333px)'
    );
  });

  test('serialize: rounds decimal midpoints away from zero accurately', () => {
    assert.equal(serialize(num(1.005), { precision: 2 }), 'calc(1.01)');
    assert.equal(serialize(num(-1.005), { precision: 2 }), 'calc(-1.01)');
    assert.equal(serialize(dim(1.005, 'px'), { precision: 2 }), 'calc(1.01px)');
    assert.equal(
      serialize(dim(-1.005, 'px'), { precision: 2 }),
      'calc(-1.01px)'
    );
    assert.equal(serialize(num(1.000005), { precision: 5 }), 'calc(1.00001)');
    assert.equal(serialize(num(-1.000005), { precision: 5 }), 'calc(-1.00001)');
  });

  test('serialize: rounds large fractional magnitudes without float drift', () => {
    // Scaling through Number(text + 'e' + p) loses the rounding boundary once
    // the shifted value exceeds Number.MAX_SAFE_INTEGER.
    assert.equal(
      serialize(num(312834450754803.44), { precision: 1 }),
      'calc(312834450754803.4)'
    );
    assert.equal(
      serialize(num(312834450754803.44), { precision: 6 }),
      'calc(312834450754803.44)'
    );
    assert.equal(
      serialize(dim(-312834450754803.44, 'px'), { precision: 1 }),
      'calc(-312834450754803.4px)'
    );
    assert.equal(
      serialize(num(39969.492943459234), { precision: 11 }),
      'calc(39969.49294345923)'
    );
  });

  test('serialize: carries a rounding carry through trailing nines', () => {
    // Rounding up 999.995 must propagate the carry across all nines to 1000.
    assert.equal(serialize(num(999.995), { precision: 2 }), 'calc(1000)');
    assert.equal(serialize(num(-999.995), { precision: 2 }), 'calc(-1000)');
    // All-nines carry combined with digit-string rounding beyond the safe
    // shift range.
    assert.equal(
      serialize(num(999999999999.995), { precision: 2 }),
      'calc(1000000000000)'
    );
  });

  test('serialize: rounds sub-1 midpoints away from zero and preserves sub-precision values', () => {
    assert.equal(serialize(num(0.05), { precision: 1 }), 'calc(.1)');
    assert.equal(serialize(num(-0.05), { precision: 1 }), 'calc(-.1)');
    assert.equal(serialize(num(0.005), { precision: 2 }), 'calc(.01)');
    // 0.004 rounds to zero at 1 place but exceeds the noise floor, so the
    // value is preserved rather than collapsed to 0.
    assert.equal(serialize(num(0.004), { precision: 1 }), 'calc(.004)');
    assert.equal(serialize(num(-0.004), { precision: 1 }), 'calc(-.004)');
  });

  test('serialize: leaves values unchanged when precision exceeds the shortest representation', () => {
    // The shortest decimal of 7341.0297734398655 has 14 fractional digits,
    // so rounding at precision 14 must return the value untouched instead of
    // rescaling through digit strings.
    assert.equal(
      serialize(num(7341.0297734398655), { precision: 14 }),
      'calc(7341.0297734398655)'
    );
  });

  test('serialize: precision 0 rounds to integers away from zero', () => {
    assert.equal(serialize(num(1.5), { precision: 0 }), 'calc(2)');
    assert.equal(serialize(num(-1.5), { precision: 0 }), 'calc(-2)');
    assert.equal(serialize(dim(1.2, 'px'), { precision: 0 }), 'calc(1px)');
    assert.equal(serialize(dim(-1.2, 'px'), { precision: 0 }), 'calc(-1px)');
  });

  test('serialize: negative and fractional precisions are clamped and truncated', () => {
    assert.equal(serialize(num(1.5), { precision: -1 }), 'calc(2)');
    assert.equal(serialize(num(-1.5), { precision: -2 }), 'calc(-2)');
    assert.equal(serialize(num(1.005), { precision: 2.5 }), 'calc(1.01)');
    assert.equal(
      serialize(dim(1.005, 'px'), { precision: 2.9 }),
      'calc(1.01px)'
    );
  });

  test('serialize: boundary precisions avoid NaN overflow', () => {
    assert.equal(serialize(num(1), { precision: 20 }), 'calc(1)');
    assert.equal(serialize(dim(1, 'px'), { precision: 100 }), 'calc(1px)');
    assert.equal(serialize(num(1), { precision: 310 }), 'calc(1)');
    assert.equal(serialize(dim(1, 'px'), { precision: 310 }), 'calc(1px)');
    assert.equal(serialize(num(1.5), { precision: 25 }), 'calc(1.5)');
    assert.equal(serialize(dim(1.5, 'px'), { precision: 25 }), 'calc(1.5px)');
  });

  test('serialize: handles input magnitudes in scientific notation, MAX_SAFE_INTEGER, and noise floor', () => {
    assert.equal(serialize(num(1e-7), { precision: 5 }), 'calc(1e-7)');
    assert.equal(serialize(num(1e-15), { precision: 5 }), 'calc(0)');
    assert.equal(serialize(num(1e21), { precision: 5 }), 'calc(1e+21)');
    assert.equal(
      serialize(num(Number.MAX_SAFE_INTEGER), { precision: 2 }),
      'calc(9007199254740991)'
    );
    assert.equal(
      serialize(dim(Number.MAX_SAFE_INTEGER, 'px'), { precision: 2 }),
      'calc(9007199254740991px)'
    );
  });

  test('serialize: preserves signed zero vs zero under custom precision', () => {
    const negNested = call('min', [num(-0), num(1)]);
    const posNested = call('min', [num(0), num(1)]);
    assert.equal(
      serialize(negNested, { precision: 2 }),
      'min(calc(-1 * 0), 1)'
    );
    assert.equal(serialize(posNested, { precision: 2 }), 'min(0, 1)');

    const negDim = call('min', [dim(-0, 'px'), dim(1, 'px')]);
    const posDim = call('min', [dim(0, 'px'), dim(1, 'px')]);
    assert.equal(
      serialize(negDim, { precision: 2 }),
      'min(calc(-1 * 0px), 1px)'
    );
    assert.equal(serialize(posDim, { precision: 2 }), 'min(0px, 1px)');
  });

  test('serialize: omits the leading zero from fractional numbers', () => {
    assert.equal(serialize(num(0.5)), 'calc(.5)');
    assert.equal(serialize(num(-0.000001)), 'calc(-.000001)');
    assert.equal(serialize(dim(0.25, 'px')), 'calc(.25px)');
    assert.equal(serialize(num(0)), 'calc(0)');
    assert.equal(serialize(num(1e-7)), 'calc(1e-7)');
  });

  test('serialize: lowers a signed zero number inside a calculation', () => {
    const nested = call('min', [num(-0), num(1)]);
    assert.equal(
      serialize(nested, { precision: false }),
      'min(calc(-1 * 0), 1)'
    );
  });

  test('serialize: lowers signed zero leaves inside structural expressions', () => {
    const ast = mkProduct([
      { exponent: 1, node: num(-0) },
      { exponent: 1, node: opaqueCall('var', [ident('--x')]) },
    ]);
    assert.equal(
      serialize(ast, { precision: false }),
      'calc(calc(-1 * 0) * var(--x))'
    );

    const dimensional = call('min', [dim(-0, 'px'), dim(1, 'px')]);
    assert.equal(
      serialize(dimensional, { precision: false }),
      'min(calc(-1 * 0px), 1px)'
    );
  });

  describe('serialize: sub-precision negative terms in sums and grouped sums', () => {
    test('sub-precision negative number term serializes as 0 in sums', () => {
      const ast = mkSum([
        { sign: 1, node: num(-1e-20) },
        { sign: 1, node: opaqueCall('var', [ident('--x')]) },
      ]);
      assert.equal(serialize(ast), 'calc(0 + var(--x))');
    });

    test('sub-precision negative number term with precision: false retains negative value in sums', () => {
      const ast = mkSum([
        { sign: 1, node: num(-1e-20) },
        { sign: 1, node: opaqueCall('var', [ident('--x')]) },
      ]);
      assert.equal(
        serialize(ast, { precision: false }),
        'calc(-1e-20 + var(--x))'
      );
    });

    test('sub-precision negative number term serializes as 0 in grouped sums', () => {
      const ast = {
        type: /** @type {const} */ ('Sum'),
        grouped: true,
        terms: [
          { sign: 1, node: num(-1e-20) },
          { sign: 1, node: opaqueCall('var', [ident('--x')]) },
        ],
      };
      assert.equal(serialize(ast), 'calc(0 + var(--x))');
    });

    test('sub-precision negative number term with precision: false retains grouped negative sum inversion', () => {
      const ast = {
        type: /** @type {const} */ ('Sum'),
        grouped: true,
        terms: [
          { sign: 1, node: num(-1e-20) },
          { sign: 1, node: opaqueCall('var', [ident('--x')]) },
        ],
      };
      assert.equal(
        serialize(ast, { precision: false }),
        'calc(-(1e-20 - var(--x)))'
      );
    });

    test('negated grouped sum with non-leading sub-precision negative term serializes with positive sign', () => {
      const ast = {
        type: /** @type {const} */ ('Sum'),
        grouped: true,
        terms: [
          { sign: 1, node: dim(-10, 'px') },
          { sign: 1, node: dim(-1e-20, 'em') },
          { sign: 1, node: opaqueCall('var', [ident('--x')]) },
        ],
      };
      assert.equal(serialize(ast), 'calc(-(10px + 0em - var(--x)))');
    });

    test('negated grouped sum with non-leading sub-precision positive term serializes with positive sign', () => {
      const ast = {
        type: /** @type {const} */ ('Sum'),
        grouped: true,
        terms: [
          { sign: 1, node: dim(-10, 'px') },
          { sign: 1, node: dim(1e-20, 'em') },
          { sign: 1, node: opaqueCall('var', [ident('--x')]) },
        ],
      };
      assert.equal(serialize(ast), 'calc(-(10px + 0em - var(--x)))');
    });
  });

  test('serialize: custom calcName', () => {
    const ast = mkSum([
      { sign: 1, node: dim(1, 'px') },
      { sign: 1, node: dim(2, 'px') },
    ]);
    assert.equal(
      serialize(ast, { calcName: '-webkit-calc' }),
      '-webkit-calc(1px + 2px)'
    );
  });
});

describe('serialize: scalar context policy', () => {
  const policies = [
    { name: 'standard', options: {} },
    { name: 'unwrapped', options: { unwrapSingleValue: true } },
  ];
  const cases = [
    {
      name: 'negative integral Num',
      node: num(-2),
      expected: ['calc(-2)', '-2'],
    },
    {
      name: 'negative fractional Num',
      node: num(-0.5),
      expected: ['calc(-.5)', '-.5'],
    },
    {
      name: 'positive integral Num',
      node: num(2),
      expected: ['calc(2)', '2'],
    },
    {
      name: 'positive fractional Num',
      node: num(0.5),
      expected: ['calc(.5)', '.5'],
    },
    {
      name: 'positive zero Num',
      node: num(0),
      expected: ['calc(0)', '0'],
    },
    {
      name: 'negative zero Num',
      node: num(-0),
      expected: ['calc(0)', '0'],
    },
    {
      name: 'negative integral Dim',
      node: dim(-2, 'px'),
      expected: ['calc(-2px)', '-2px'],
    },
    {
      name: 'negative fractional Dim',
      node: dim(-0.5, 'px'),
      expected: ['calc(-.5px)', '-.5px'],
    },
    {
      name: 'positive integral Dim',
      node: dim(2, 'px'),
      expected: ['calc(2px)', '2px'],
    },
    {
      name: 'positive fractional Dim',
      node: dim(0.5, 'px'),
      expected: ['calc(.5px)', '.5px'],
    },
    {
      name: 'negative zero Dim',
      node: dim(-0, 'px'),
      expected: ['calc(0px)', '0px'],
    },
    {
      name: 'Infinity Num',
      node: num(Infinity),
      expected: ['calc(infinity)', 'calc(infinity)'],
    },
    {
      name: 'NaN Dim',
      node: dim(Number.NaN, 'px'),
      expected: ['calc(NaN * 1px)', 'calc(NaN * 1px)'],
    },
  ];

  for (const scalarCase of cases) {
    for (const [policyIndex, policy] of policies.entries()) {
      test(`${scalarCase.name} uses ${policy.name}`, () => {
        const output = serialize(scalarCase.node, policy.options);
        assert.equal(output, scalarCase.expected[policyIndex]);

        const tokens = tokenize({ css: output });
        const reparsed = simplify(
          parse(tokens, 0, tokens.length, indexBlocks(tokens))
        );
        assert.equal(
          serialize(reparsed, policy.options),
          output,
          'formatted output must round-trip under the same policy'
        );
      });
    }
  }

  const precisionCases = [
    {
      name: 'precision false keeps a fractional Num',
      node: num(0.5),
      options: { precision: false },
      expected: ['calc(.5)', '.5'],
    },
    {
      name: 'precision zero classifies a rounded Num as integral',
      node: num(1.4),
      options: { precision: 0 },
      expected: ['calc(1)', '1'],
    },
    {
      name: 'decimal precision classifies the formatted fraction',
      node: num(1.4),
      options: { precision: 1 },
      expected: ['calc(1.4)', '1.4'],
    },
    {
      name: 'precision zero censors a tiny negative value to zero',
      node: num(-1e-13),
      options: { precision: 0 },
      expected: ['calc(0)', '0'],
    },
    {
      name: 'decimal precision applies to a dimensional fraction',
      node: dim(1.234, 'px'),
      options: { precision: 2 },
      expected: ['calc(1.23px)', '1.23px'],
    },
  ];

  for (const precisionCase of precisionCases) {
    for (const [policyIndex, policy] of policies.entries()) {
      test(`${precisionCase.name} uses ${policy.name}`, () => {
        assert.equal(
          serialize(precisionCase.node, {
            ...precisionCase.options,
            ...policy.options,
          }),
          precisionCase.expected[policyIndex]
        );
      });
    }
  }
});

// --- Mutation-targeted tests ---------------------------------------------
describe('serialize: mutation-targeted tests', () => {
  test('does not carry a negative scalar magnitude into positive siblings', () => {
    const ast = mkSum([
      { sign: 1, node: num(-2) },
      { sign: 1, node: num(3) },
      { sign: 1, node: dim(4, 'px') },
    ]);
    assert.equal(serialize(ast), 'calc(-2 + 3 + 4px)');
  });

  test('scopes negated product coefficients to one product', () => {
    const withCoefficient = mkSum([
      {
        sign: -1,
        node: mkProduct([
          { exponent: 1, node: num(2) },
          { exponent: 1, node: ident('x') },
        ]),
      },
    ]);
    const withoutCoefficient = mkSum([
      {
        sign: -1,
        node: mkProduct([
          { exponent: 1, node: ident('a') },
          { exponent: 1, node: ident('b') },
        ]),
      },
    ]);
    assert.equal(serialize(withCoefficient), 'calc(-2 * x)');
    assert.equal(serialize(withoutCoefficient), 'calc(-(a * b))');
    assert.equal(
      serialize(call('min', [withCoefficient, withoutCoefficient])),
      'min(-2 * x, -(a * b))'
    );
  });

  test('isolates nested sums and products across call arguments', () => {
    const ast = call('min', [
      mkSum([
        { sign: 1, node: num(1) },
        { sign: 1, node: num(2) },
      ]),
      mkProduct([
        { exponent: 1, node: num(2) },
        { exponent: 1, node: dim(3, 'px') },
      ]),
    ]);
    assert.equal(serialize(ast), 'min(1 + 2, 2 * 3px)');
  });

  test('keeps a root call spelling override out of nested calls', () => {
    assert.equal(
      serializeResult({
        tree: call('sin', [call('cos', [ident('--x')])]),
        status: 'unresolved',
        rootName: 'sin',
        rootSpelling: 'SIN',
        original: 'SIN(cos(--x))',
      }),
      'SIN(cos(--x))'
    );
  });

  test('writes nested opaque fallbacks directly into the parent buffer', () => {
    const ast = opaqueCall('var', [
      ident('--outer'),
      ', ',
      opaqueCall('var', [
        ident('--inner'),
        ', ',
        mkSum([
          { sign: 1, node: dim(1, 'px') },
          { sign: 1, node: dim(2, 'px') },
        ]),
      ]),
    ]);
    assert.equal(serialize(ast), 'var(--outer, var(--inner, calc(1px + 2px)))');
  });

  test('serialize: displaySign flips negative Num to `-` operator', () => {
    // `5 + Num(-3)` should render as `5 - 3`, not `5 + -3`.
    // This kills the displaySign branch for Num with value<0.
    const ast = mkSum([
      { sign: 1, node: { type: 'Num', value: 5 } },
      { sign: 1, node: { type: 'Num', value: -3 } },
    ]);
    assert.equal(serialize(ast), 'calc(5 - 3)');
  });

  test('serialize: displaySign flips negative Dim to `-` operator', () => {
    // Same but for Dim leaves — `5px + Dim(-2, em)` → `5px - 2em`.
    const ast = mkSum([
      { sign: 1, node: { type: 'Dim', value: 5, unit: 'px' } },
      { sign: 1, node: { type: 'Dim', value: -2, unit: 'em' } },
    ]);
    assert.equal(serialize(ast), 'calc(5px - 2em)');
  });

  test('serialize: negative leading Num keeps calc() function', () => {
    assert.equal(serialize(num(-5)), 'calc(-5)');
  });

  test('serialize: single-term Sum with sign=-1 and opaque call → calc(-call)', () => {
    // `-var(--x)` shape — only reachable as a directly-constructed Sum
    // (parser never produces it; mkSum would collapse if leaf).
    const ast = {
      type: 'Sum',
      terms: [
        {
          sign: -1,
          node: opaqueCall('var', [ident('--x')]),
        },
      ],
    };
    assert.equal(serialize(ast), 'calc(-var(--x))');
  });

  test('serialize: single-term Sum with sign=-1 and Product needs outer parens', () => {
    // `-(a * b)` must wrap the product so unary `-` binds the whole thing
    // on re-parse (otherwise `-a * b` = `(-a) * b`).
    const ast = {
      type: 'Sum',
      terms: [
        {
          sign: -1,
          node: {
            type: 'Product',
            factors: [
              { exponent: 1, node: { type: 'Ident', name: 'a' } },
              { exponent: 1, node: { type: 'Ident', name: 'b' } },
            ],
          },
        },
      ],
    };
    assert.equal(serialize(ast), 'calc(-(a * b))');
  });

  test('serialize: multi-term Sum with trailing zero-valued Dim', () => {
    // `1px + 0em` — both non-zero positions tested; exercises the
    // iteration body and operator choice for non-first terms.
    const ast = mkSum([
      { sign: 1, node: dim(1, 'px') },
      { sign: 1, node: dim(0, 'em') },
    ]);
    assert.equal(serialize(ast), 'calc(1px + 0em)');
  });

  test('serialize: Product with leading denominator emits implicit 1', () => {
    // `Product([{-1, 2px}])` (impossible from parser but constructible)
    // should emit `1 / 2px`, exercising the exponent=-1 first-factor branch.
    const ast = {
      type: 'Product',
      factors: [{ exponent: -1, node: dim(2, 'px') }],
    };
    assert.equal(serialize(ast), 'calc(1 / 2px)');
  });
});

// --- §10.13 degenerate-numeric serialization ----------------------------
describe('serialize: degenerate numeric', () => {
  test('serialize: Num(Infinity) → calc(infinity)', () => {
    assert.equal(serialize(num(Infinity)), 'calc(infinity)');
  });

  test('serialize: Num(-Infinity) → calc(-infinity)', () => {
    assert.equal(serialize(num(-Infinity)), 'calc(-infinity)');
  });

  test('serialize: Num(NaN) → calc(NaN)', () => {
    assert.equal(serialize(num(Number.NaN)), 'calc(NaN)');
  });

  test('serialize: Dim(Infinity, px) → calc(infinity * 1px)', () => {
    assert.equal(serialize(dim(Infinity, 'px')), 'calc(infinity * 1px)');
  });

  test('serialize: Dim(-Infinity, px) → calc(-infinity * 1px)', () => {
    assert.equal(serialize(dim(-Infinity, 'px')), 'calc(-infinity * 1px)');
  });

  test('serialize: Dim(NaN, deg) → calc(NaN * 1deg)', () => {
    assert.equal(serialize(dim(Number.NaN, 'deg')), 'calc(NaN * 1deg)');
  });

  test('serialize: degenerate Dim preserves escaped raw unit', () => {
    assert.equal(
      serialize(dim(Infinity, 'f,oo', String.raw`f\2c oo`)),
      String.raw`calc(infinity * 1f\2c oo)`
    );
  });

  test('serialize: nested degenerate Dim preserves escaped raw unit', () => {
    const ast = mkProduct([
      { exponent: 1, node: opaqueCall('var', [ident('--x')]) },
      { exponent: 1, node: dim(Number.NaN, 'f,oo', String.raw`f\2c oo`) },
    ]);
    assert.equal(
      serialize(ast),
      String.raw`calc(var(--x) * calc(NaN * 1f\2c oo))`
    );
  });

  test('serialize: degenerate uses calcName option (vendor prefix)', () => {
    assert.equal(
      serialize(num(Infinity), { calcName: '-webkit-calc' }),
      '-webkit-calc(infinity)'
    );
    assert.equal(
      serialize(dim(Number.NaN, 'px'), { calcName: '-moz-calc' }),
      '-moz-calc(NaN * 1px)'
    );
  });

  test('serialize: precision does not round Infinity / NaN', () => {
    assert.equal(serialize(num(Infinity), { precision: 2 }), 'calc(infinity)');
    assert.equal(
      serialize(dim(Number.NaN, 'px'), { precision: 0 }),
      'calc(NaN * 1px)'
    );
  });

  test('serialize: degenerate Num inside Sum context emits keyword', () => {
    // var(--x) + Infinity → keyword spelling, no nested calc().
    const ast = mkSum([
      { sign: 1, node: { type: 'Ident', name: 'var(--x)' } },
      { sign: 1, node: num(Infinity) },
    ]);
    assert.equal(serialize(ast), 'calc(var(--x) + infinity)');
  });

  test('serialize: NaN keeps canonical casing (never nan/NAN)', () => {
    // §10.7.2 line 1182.
    assert.equal(serialize(num(Number.NaN)).includes('NaN'), true);
    assert.equal(serialize(num(Number.NaN)).includes('nan'), false);
  });
});

describe('serializeResult: root planning', () => {
  test('preserves the original unresolved non-root call', () => {
    assert.equal(
      serializeResult({
        tree: opaqueCall('sin', [ident('--x')]),
        status: 'unresolved',
        rootName: 'custom',
        rootSpelling: 'CUSTOM',
        original: 'CUSTOM(var(--x))',
      }),
      'CUSTOM(var(--x))'
    );
  });

  test('overrides an unresolved root call name without slicing a child string', () => {
    assert.equal(
      serializeResult({
        tree: opaqueCall('sin', [opaqueCall('var', [ident('--x')])]),
        status: 'unresolved',
        rootName: 'sin',
        rootSpelling: 'SIN',
        original: 'SIN(var(--x))',
      }),
      'SIN(var(--x))'
    );
  });

  test('preserves a vendor wrapper at the resolved calculation boundary', () => {
    const tree = mkSum([
      { sign: 1, node: dim(1, 'px') },
      { sign: 1, node: dim(2, 'px') },
    ]);
    assert.equal(
      serializeResult({
        tree,
        status: 'resolved',
        rootName: '-webkit-calc',
        rootSpelling: '-webkit-calc',
        original: '-webkit-calc(1px + 2px)',
      }),
      '-webkit-calc(1px + 2px)'
    );
  });

  test('threads scalar policy through nested opaque fallbacks', () => {
    const tree = opaqueCall('var', [
      ident('--x'),
      ', ',
      mkSum([
        { sign: 1, node: dim(1, 'px') },
        { sign: 1, node: dim(2, 'px') },
      ]),
    ]);
    const result = {
      tree,
      status: /** @type {'resolved'} */ ('resolved'),
      rootName: 'calc',
      rootSpelling: 'calc',
      original: 'calc(var(--x, 1px + 2px))',
    };
    assert.equal(serializeResult(result), 'calc(var(--x, calc(1px + 2px)))');
    assert.equal(
      serializeResult(result, { unwrapSingleValue: true }),
      'var(--x, calc(1px + 2px))'
    );
  });

  test('keeps valid nested opaque depth and rejects one level beyond the limit', () => {
    assert.doesNotThrow(() =>
      serializeResult(serializeResultInput(nestedOpaque(512)))
    );
    assert.throws(
      () => serializeResult(serializeResultInput(nestedOpaque(513))),
      /Calculation nesting exceeds the limit of 1024/
    );
  });
});
