// Pre-simplify args once, route by name. Leaf folds receive simplified
// args so they don't need to recurse into `simplify` themselves.

import { simplifyMinMax } from './min-max.js';
import { simplifyClamp } from './clamp.js';
import { simplifyAbs } from './abs.js';
import { simplifySign } from './sign.js';
import { simplifyModRem } from './mod-rem.js';
import { simplifyRound } from './round.js';
import { simplifyTrig } from './trig.js';
import { simplifyInverseTrig } from './inverse-trig.js';
import { simplifyAtan2 } from './atan2.js';
import { simplifyPow } from './pow.js';
import { simplifySqrt } from './sqrt.js';
import { simplifyExp } from './exp.js';
import { simplifyLog } from './log.js';
import { simplifyHypot } from './hypot.js';

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

  if (name === 'min' || name === 'max') {
    return simplifyMinMax(node.name, args);
  }
  if (name === 'clamp') {
    return simplifyClamp(args);
  }
  if (name === 'abs') {
    return simplifyAbs(args);
  }
  if (name === 'sign') {
    return simplifySign(args);
  }
  if (name === 'mod' || name === 'rem') {
    return simplifyModRem(name, args);
  }
  if (name === 'round') {
    return simplifyRound(args);
  }
  if (name === 'sin' || name === 'cos' || name === 'tan') {
    return simplifyTrig(name, args);
  }
  if (name === 'asin' || name === 'acos' || name === 'atan') {
    return simplifyInverseTrig(name, args);
  }
  if (name === 'atan2') {
    return simplifyAtan2(args);
  }
  if (name === 'pow') {
    return simplifyPow(args);
  }
  if (name === 'sqrt') {
    return simplifySqrt(args);
  }
  if (name === 'hypot') {
    return simplifyHypot(args);
  }
  if (name === 'log') {
    return simplifyLog(args);
  }
  if (name === 'exp') {
    return simplifyExp(args);
  }

  return { type: 'Call', name: node.name, args };
}

export { simplifyCall };
