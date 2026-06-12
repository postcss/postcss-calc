'use strict';

// §10.4 — atan2. foldConstArgs already rejects percentages (property-
// context-resolved) and enforces shared base + static convertibility.

const { num, dim } = require('../node.js');
const { foldConstArgs } = require('./fold.js');

/** @typedef {import('../node.js').Node} Node */

/**
 * @param {Node[]} args
 * @return {Node}
 */
function simplifyAtan2(args) {
  if (args.length !== 2) {return { type: 'Call', name: 'atan2', args };}
  const fold = foldConstArgs(args);
  if (fold === null) {return { type: 'Call', name: 'atan2', args };}
  const [y, x] = /** @type {[number, number]} */ (fold.values);
  const radians = Math.atan2(y, x);
  if (isNaN(radians)) {return num(NaN);}
  return dim((radians * 180) / Math.PI, 'deg');
}

module.exports = { simplifyAtan2 };
