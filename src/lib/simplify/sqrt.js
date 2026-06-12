'use strict';

const { num } = require('../node.js');

/** @typedef {import('../node.js').Node} Node */

/**
 * @param {Node[]} args
 * @return {Node}
 */
function simplifySqrt(args) {
  if (args.length !== 1 || args[0].type !== 'Num') {
    return { type: 'Call', name: 'sqrt', args };
  }
  return num(Math.sqrt(args[0].value));
}

module.exports = { simplifySqrt };
