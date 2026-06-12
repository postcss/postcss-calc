'use strict';

// Pre-simplify args once, route by name. Leaf folds receive simplified
// args so they don't need to recurse into `simplify` themselves.

const { simplifyMinMax } = require('./min-max.js');
const { simplifyClamp } = require('./clamp.js');
const { simplifyAbs } = require('./abs.js');
const { simplifySign } = require('./sign.js');
const { simplifyModRem } = require('./mod-rem.js');
const { simplifyRound } = require('./round.js');
const { simplifyTrig } = require('./trig.js');
const { simplifyInverseTrig } = require('./inverse-trig.js');
const { simplifyAtan2 } = require('./atan2.js');
const { simplifyPow } = require('./pow.js');
const { simplifySqrt } = require('./sqrt.js');
const { simplifyExp } = require('./exp.js');
const { simplifyLog } = require('./log.js');
const { simplifyHypot } = require('./hypot.js');

/** @typedef {import('../node.js').Node} Node */
/** @typedef {import('../simplify.js').SimplifyFn} SimplifyFn */

/**
 * @param {Extract<Node, { type: 'Call' }>} node
 * @param {SimplifyFn} simplify
 * @return {Node}
 */
function simplifyCall(node, simplify) {
  const name = node.name.toLowerCase();

  if (name === 'calc' || name === '-webkit-calc' || name === '-moz-calc') {
    if (node.args.length !== 1) {
      throw new Error(`${node.name}() takes exactly one argument`);
    }
    return simplify(node.args[0]);
  }

  const args = node.args.map((a) => simplify(a));

  if (name === 'min' || name === 'max') {return simplifyMinMax(node.name, args);}
  if (name === 'clamp') {return simplifyClamp(args);}
  if (name === 'abs') {return simplifyAbs(args);}
  if (name === 'sign') {return simplifySign(args);}
  if (name === 'mod' || name === 'rem') {return simplifyModRem(name, args);}
  if (name === 'round') {return simplifyRound(args);}
  if (name === 'sin' || name === 'cos' || name === 'tan') {return simplifyTrig(name, args);}
  if (name === 'asin' || name === 'acos' || name === 'atan') {return simplifyInverseTrig(name, args);}
  if (name === 'atan2') {return simplifyAtan2(args);}
  if (name === 'pow') {return simplifyPow(args);}
  if (name === 'sqrt') {return simplifySqrt(args);}
  if (name === 'hypot') {return simplifyHypot(args);}
  if (name === 'log') {return simplifyLog(args);}
  if (name === 'exp') {return simplifyExp(args);}

  return { type: 'Call', name: node.name, args };
}

module.exports = { simplifyCall };
