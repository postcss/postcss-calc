'use strict';

const { num } = require('../node.js');

/** @typedef {import('../node.js').Node} Node */

/**
 * @param {Node[]} args
 * @return {Node}
 */
function simplifyLog(args) {
  if (args.length === 1 && args[0].type === 'Num') {
    return num(Math.log(args[0].value));
  }
  if (
    args.length === 2 &&
    args[0].type === 'Num' &&
    args[1].type === 'Num'
  ) {
    return num(Math.log(args[0].value) / Math.log(args[1].value));
  }
  return { type: 'Call', name: 'log', args };
}

module.exports = { simplifyLog };
