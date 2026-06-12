'use strict';

// §10.4 — asin/acos/atan. Bare <number> in, <angle> in degrees out.

const { num, dim } = require('../node.js');

/** @typedef {import('../node.js').Node} Node */

const INVERSE_TRIG_OPS = /** @type {const} */ ({
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
});

/**
 * @param {'asin' | 'acos' | 'atan'} name
 * @param {Node[]} args
 * @return {Node}
 */
function simplifyInverseTrig(name, args) {
  if (args.length !== 1) {return { type: 'Call', name, args };}
  const a = args[0];
  if (a.type !== 'Num') {return { type: 'Call', name, args };}
  const radians = INVERSE_TRIG_OPS[name](a.value);
  if (isNaN(radians)) {return num(NaN);}
  return dim((radians * 180) / Math.PI, 'deg');
}

module.exports = { simplifyInverseTrig };
