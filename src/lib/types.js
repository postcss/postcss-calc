/**
 * `percent` marks a value that resolves in the same percentage context as its
 * peers (a pure percentage). It is only produced at leaves, by abs(), and by
 * homogeneous sums and calls — never by a product, where an unpaired
 * percentage could no longer cancel against anything.
 * @typedef {{kind: 'number'} | {kind: 'dimension', base: string | null} | {kind: 'unknown', percent?: true} | {kind: 'failure'}} CalculationType
 */

/** @type {CalculationType} */ const numberType = { kind: 'number' };
/** @type {CalculationType} */ const unknownType = { kind: 'unknown' };
/** @type {CalculationType} */ const percentageType = {
  kind: 'unknown',
  percent: true,
};
/** @type {CalculationType} */ const failureType = { kind: 'failure' };

/** @param {CalculationType} type @return {boolean} */
function isFailure(type) {
  return type.kind === 'failure';
}

/** @param {CalculationType} type @return {boolean} */
function isPercentage(type) {
  return type.kind === 'unknown' && type.percent === true;
}

/** @param {CalculationType} a @param {CalculationType} b @return {CalculationType} */
function addTypes(a, b) {
  if (isFailure(a) || isFailure(b)) return failureType;
  if (a.kind === 'unknown' || b.kind === 'unknown') {
    // A pure percentage keeps its contextual type so a surrounding product
    // can cancel `% / %`; mixing it with any other opaque operand loses the
    // guarantee that it resolves in the same context as its peers. A known
    // number + percentage sum is likewise kept unknown and valid: the spec
    // resolves the percentage against its surrounding context, which this
    // coarse type model does not track.
    return isPercentage(a) && isPercentage(b) ? percentageType : unknownType;
  }
  if (a.kind === 'number' && b.kind === 'number') return numberType;
  if (a.kind === 'dimension' && b.kind === 'dimension') {
    if (a.base === null || b.base === null) return unknownType;
    return a.base === b.base ? a : failureType;
  }
  return failureType;
}

/**
 * Check an all-number function without assuming anything about an unresolved
 * operand. A concrete dimension can never become a number, so it is still a
 * definite error when another argument is opaque.
 * @param {CalculationType[]} args
 * @param {number} min
 * @param {number} max
 * @return {CalculationType}
 */
function numberArguments(args, min, max) {
  if (args.length < min || args.length > max) return failureType;
  let hasUnknown = false;
  for (const arg of args) {
    if (arg.kind === 'dimension') return failureType;
    hasUnknown = hasUnknown || arg.kind === 'unknown';
  }
  return hasUnknown ? unknownType : numberType;
}

/**
 * Check values that must share a calculation type. Unknown operands remain
 * unknown: they might resolve to the concrete type required by their peers.
 * @param {CalculationType[]} args
 * @param {number} min
 * @param {number} max
 * @return {CalculationType}
 */
function matchingArguments(args, min, max) {
  if (args.length < min || args.length > max) return failureType;
  let result = args[0];
  for (let index = 1; index < args.length; index++) {
    result = addTypes(result, args[index]);
    if (isFailure(result)) return failureType;
  }
  return result;
}

export {
  addTypes,
  failureType,
  isFailure,
  isPercentage,
  matchingArguments,
  numberArguments,
  numberType,
  percentageType,
  unknownType,
};
