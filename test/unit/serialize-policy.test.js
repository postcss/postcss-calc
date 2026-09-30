import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize as serializeSource } from '../../src/lib/serialize.js';
import { num, dim } from '../../src/lib/node.js';
import { tokenize } from '@csstools/css-tokenizer';
import { indexBlocks } from '../../src/lib/block-index.js';
import { parse } from '../../src/lib/parser.js';
import { simplify } from '../../src/lib/simplify.js';

const serialize = (node, opts = {}) => serializeSource(node, opts);

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
