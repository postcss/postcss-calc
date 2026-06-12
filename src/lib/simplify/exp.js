'use strict';

const { num } = require('../node.js');

/** @typedef {import('../node.js').Node} Node */

/**
 * @param {Node[]} args
 * @return {Node}
 */
function simplifyExp(args) {
  if (args.length !== 1 || args[0].type !== 'Num') {
    return { type: 'Call', name: 'exp', args };
  }
  return num(Math.exp(args[0].value));
}

module.exports = { simplifyExp };
