'use strict';

// §10.5 — hypot. Empty args return null from foldConstArgs naturally.

const { num, dim } = require('../node.js');
const { foldConstArgs } = require('./fold.js');

/** @typedef {import('../node.js').Node} Node */

/**
 * @param {Node[]} args
 * @return {Node}
 */
function simplifyHypot(args) {
  const fold = foldConstArgs(args);
  if (fold === null) {return { type: 'Call', name: 'hypot', args };}
  const sumSq = fold.values.reduce((acc, v) => acc + v * v, 0);
  const result = Math.sqrt(sumSq);
  return fold.unit === '' ? num(result) : dim(result, fold.unit);
}

module.exports = { simplifyHypot };
