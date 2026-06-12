'use strict';

const { num, dim } = require('../node.js');
const { foldConstArgs } = require('./fold.js');

/** @typedef {import('../node.js').Node} Node */

/**
 * @param {string} name
 * @param {Node[]} args
 * @return {Node}
 */
function simplifyMinMax(name, args) {
  const fold = foldConstArgs(args);
  if (fold !== null) {
    const fn = name.toLowerCase() === 'min' ? Math.min : Math.max;
    const value = fn(...fold.values);
    return fold.unit === '' ? num(value) : dim(value, fold.unit);
  }
  return { type: 'Call', name, args };
}

module.exports = { simplifyMinMax };
