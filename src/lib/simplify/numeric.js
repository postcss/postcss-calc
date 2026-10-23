// §10.4–§10.7 — abs/sign and the <number>-only functions pow/sqrt/exp/log.

import { num, dim, call } from '../node.js';

/** @typedef {import('../node.js').Node} Node */

/**
 * `%` is property-context-dependent (§10.6), so it stays opaque.
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
function simplifyAbs(args, name) {
  if (args.length !== 1) return call(name, args);
  const a = args[0];
  if (a.type === 'Num') return num(Math.abs(a.value));
  if (a.type === 'Dim' && a.unit !== '%') {
    return dim(Math.abs(a.value), a.unit, a.rawUnit);
  }
  return call(name, args);
}

/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
function simplifySign(args, name) {
  if (args.length !== 1) return call(name, args);
  const a = args[0];
  if (a.type === 'Num' || (a.type === 'Dim' && a.unit !== '%')) {
    return num(Math.sign(a.value));
  }
  return call(name, args);
}

/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
function simplifySqrt(args, name) {
  if (args.length !== 1 || args[0].type !== 'Num') return call(name, args);
  return num(Math.sqrt(args[0].value));
}

/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
function simplifyExp(args, name) {
  if (args.length !== 1 || args[0].type !== 'Num') return call(name, args);
  return num(Math.exp(args[0].value));
}

/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
function simplifyPow(args, name) {
  if (args.length !== 2 || args[0].type !== 'Num' || args[1].type !== 'Num') {
    return call(name, args);
  }
  return num(Math.pow(args[0].value, args[1].value));
}

/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
function simplifyLog(args, name) {
  if (args.length === 1 && args[0].type === 'Num') {
    return num(Math.log(args[0].value));
  }
  if (args.length === 2 && args[0].type === 'Num' && args[1].type === 'Num') {
    return num(Math.log(args[0].value) / Math.log(args[1].value));
  }
  return call(name, args);
}

export {
  simplifyAbs,
  simplifyExp,
  simplifyLog,
  simplifyPow,
  simplifySign,
  simplifySqrt,
};
