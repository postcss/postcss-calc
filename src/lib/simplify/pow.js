'use strict';

// §10.5 — pow is <number>-only.

const { num } = require('../node.js');

/** @typedef {import('../node.js').Node} Node */

/**
 * @param {Node[]} args
 * @return {Node}
 */
function simplifyPow(args) {
  if (args.length !== 2 || args[0].type !== 'Num' || args[1].type !== 'Num') {
    return { type: 'Call', name: 'pow', args };
  }
  return num(Math.pow(args[0].value, args[1].value));
}

module.exports = { simplifyPow };
