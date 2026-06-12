// Pre-simplify args once, route by name. Leaf folds receive simplified
// args so they don't need to recurse into `simplify` themselves.

import type { Node } from '../node.ts';
import type { SimplifyFn } from './types.ts';

import { simplifyMinMax } from './min-max.ts';
import { simplifyClamp } from './clamp.ts';
import { simplifyAbs } from './abs.ts';
import { simplifySign } from './sign.ts';
import { simplifyModRem } from './mod-rem.ts';
import { simplifyRound } from './round.ts';
import { simplifyTrig } from './trig.ts';
import { simplifyInverseTrig } from './inverse-trig.ts';
import { simplifyAtan2 } from './atan2.ts';
import { simplifyPow } from './pow.ts';
import { simplifySqrt } from './sqrt.ts';
import { simplifyExp } from './exp.ts';
import { simplifyLog } from './log.ts';
import { simplifyHypot } from './hypot.ts';

export function simplifyCall(
  node: Extract<Node, { type: 'Call' }>,
  simplify: SimplifyFn
): Node {
  const name = node.name.toLowerCase();

  if (name === 'calc' || name === '-webkit-calc' || name === '-moz-calc') {
    if (node.args.length !== 1) {
      throw new Error(`${node.name}() takes exactly one argument`);
    }
    return simplify(node.args[0]!);
  }

  const args = node.args.map((a) => simplify(a));

  if (name === 'min' || name === 'max') return simplifyMinMax(node.name, args);
  if (name === 'clamp') return simplifyClamp(args);
  if (name === 'abs') return simplifyAbs(args);
  if (name === 'sign') return simplifySign(args);
  if (name === 'mod' || name === 'rem') return simplifyModRem(name, args);
  if (name === 'round') return simplifyRound(args);
  if (name === 'sin' || name === 'cos' || name === 'tan') return simplifyTrig(name, args);
  if (name === 'asin' || name === 'acos' || name === 'atan') return simplifyInverseTrig(name, args);
  if (name === 'atan2') return simplifyAtan2(args);
  if (name === 'pow') return simplifyPow(args);
  if (name === 'sqrt') return simplifySqrt(args);
  if (name === 'hypot') return simplifyHypot(args);
  if (name === 'log') return simplifyLog(args);
  if (name === 'exp') return simplifyExp(args);

  return { type: 'Call', name: node.name, args };
}
