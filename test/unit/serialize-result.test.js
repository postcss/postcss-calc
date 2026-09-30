import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serialize as serializeSource,
  serializeResult as serializeResultSource,
} from '../../src/lib/serialize.js';
import {
  num,
  dim,
  opaqueCall,
  call,
  ident,
  mkSum,
  mkProduct,
} from '../../src/lib/node.js';

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
});
