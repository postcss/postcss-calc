import { baseOf } from './convertUnits.js';
import { addTypes, isFailure, mathFunctions } from './functions.js';
import { assertDepth } from './limits.js';

/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./functions.js').CalculationType} CalculationType */

/** @typedef {'number' | 'unknown' | {dimension: string | null}} AnalysisType */
/** @typedef {{type: AnalysisType, valid: boolean, unresolved: boolean}} Analysis */

/** @type {CalculationType} */ const numberType = { kind: 'number' };
/** @type {CalculationType} */ const unknownType = { kind: 'unknown' };
/** @type {CalculationType} */ const failureType = { kind: 'failure' };

/**
 * Analyze the original complete tree and return its root summary. Analysis
 * validates and classifies the tree; it is not a rewrite plan.
 * @param {Node} node
 * @return {Analysis}
 */
function analyze(node) {
  const result = analyzeType(node);
  return {
    type: publicType(result.type),
    valid: result.valid,
    unresolved: result.unresolved,
  };
}

/** @param {Node} node @param {number} [depth] @return {{type: CalculationType, valid: boolean, unresolved: boolean}} */
function analyzeType(node, depth = 0) {
  assertDepth(depth);
  switch (node.type) {
    case 'Num':
      return resolved(numberType);
    case 'Dim':
      // Percentages are contextual. Unknown units are opaque, while known
      // families can still reject px + seconds.
      return node.unit === '%'
        ? finish(unknownType, true, true)
        : resolved({ kind: 'dimension', base: baseOf(node.unit) });
    case 'Ident':
      return markUnresolved(unknownType);
    case 'Sum':
      return analyzeSum(node, depth);
    case 'Product':
      return analyzeProduct(node, depth);
    case 'Call':
      return analyzeCall(node, depth);
    case 'OpaqueCall':
      return finish(unknownType, true, true);
  }
}

/** @param {Extract<Node, {type: 'Sum'}>} node @param {number} depth @return {{type: CalculationType, valid: boolean, unresolved: boolean}} */
function analyzeSum(node, depth) {
  let type = null;
  let hasUnknown = false;
  let valid = true;
  let hasUnresolved = false;
  for (const term of node.terms) {
    const child = analyzeType(term.node, depth + 1);
    valid = valid && child.valid;
    hasUnresolved = hasUnresolved || child.unresolved;
    if (isFailure(child.type)) {
      type = failureType;
    } else if (child.type.kind === 'unknown') {
      hasUnknown = true;
    } else if (type === null) {
      type = child.type;
    } else if (!isFailure(type)) {
      type = addTypes(type, child.type);
    }
  }
  if (type !== null && isFailure(type)) {
    return finish(failureType, false, hasUnresolved);
  }
  return finish(
    type ?? (hasUnknown ? unknownType : numberType),
    valid,
    hasUnresolved
  );
}

/** @param {Extract<Node, {type: 'Product'}>} node @param {number} depth @return {{type: CalculationType, valid: boolean, unresolved: boolean}} */
function analyzeProduct(node, depth) {
  let numerator = null;
  let denominator = null;
  let valid = true;
  let structurallyValid = true;
  let hasUnknownNumerator = false;
  let hasUnknownDenominator = false;
  let hasUnresolved = false;
  for (const factor of node.factors) {
    const child = analyzeType(factor.node, depth + 1);
    valid = valid && child.valid;
    hasUnresolved = hasUnresolved || child.unresolved;
    if (isFailure(child.type)) {
      continue;
    }
    if (child.type.kind === 'unknown') {
      if (factor.exponent === 1) hasUnknownNumerator = true;
      else hasUnknownDenominator = true;
      continue;
    }
    if (child.type.kind !== 'dimension') continue;
    if (factor.exponent === 1) {
      if (numerator !== null) structurallyValid = false;
      else numerator = child.type;
    } else {
      if (denominator !== null) structurallyValid = false;
      else denominator = child.type;
    }
  }
  if (!valid) return finish(failureType, false, hasUnresolved);
  // Opaque factors can supply missing type information, but they cannot make
  // an already-invalid combination of known dimensions valid.
  if (!structurallyValid) return finish(failureType, false, hasUnresolved);
  if (
    numerator !== null &&
    denominator !== null &&
    numerator.base !== denominator.base
  ) {
    return finish(failureType, false, hasUnresolved);
  }
  // An unresolved numerator multiplied by one known numerator dimension can
  // only leave that dimension in place (when it resolves to a number) or make
  // the product invalid. It can never make the product a bare number. Keep
  // that known constraint so a surrounding sum can reject `1px * 1% + 1`.
  const constrained = constrainedNumerator(
    hasUnknownNumerator,
    hasUnknownDenominator,
    numerator,
    denominator
  );
  if (constrained !== null) {
    return finish(constrained, true, hasUnresolved);
  }
  // Other opaque factors may supply type information that changes how the
  // known dimensions combine once the known factors are structurally valid.
  if (hasUnknownNumerator || hasUnknownDenominator) {
    return finish(unknownType, true, hasUnresolved);
  }
  if (numerator !== null && denominator !== null) {
    return finish(
      numerator.base === denominator.base ? numberType : failureType,
      valid && numerator.base === denominator.base,
      hasUnresolved
    );
  }
  if (denominator !== null) return finish(failureType, false, hasUnresolved);
  return finish(numerator ?? numberType, valid, hasUnresolved);
}

/**
 * @param {boolean} hasUnknownNumerator
 * @param {boolean} hasUnknownDenominator
 * @param {CalculationType | null} numerator
 * @param {CalculationType | null} denominator
 * @return {CalculationType | null}
 */
function constrainedNumerator(
  hasUnknownNumerator,
  hasUnknownDenominator,
  numerator,
  denominator
) {
  return hasUnknownNumerator &&
    !hasUnknownDenominator &&
    numerator !== null &&
    denominator === null
    ? numerator
    : null;
}

/** @param {Extract<Node, {type: 'Call'}>} node @param {number} depth @return {{type: CalculationType, valid: boolean, unresolved: boolean}} */
function analyzeCall(node, depth) {
  const name = node.name.toLowerCase();
  const definition = mathFunctions.get(name);
  /** @type {CalculationType[]} */
  const childTypes = [];
  let valid = true;
  let unresolvedArgs = false;
  for (let index = 0; index < node.args.length; index++) {
    const child = analyzeType(node.args[index], depth + 1);
    childTypes.push(child.type);
    valid = valid && child.valid;
    if (!definition?.isKeyword?.(node.args[index], index) && child.unresolved) {
      unresolvedArgs = true;
    }
  }
  if (!definition) return finish(unknownType, valid, true);
  const type = definition.analyze(childTypes, node.args);
  const unresolvedType = type.kind === 'unknown';
  return finish(
    type,
    valid && !isFailure(type),
    unresolvedArgs || unresolvedType
  );
}

/** @param {CalculationType} type @param {boolean} valid @param {boolean} unresolved @return {{type: CalculationType, valid: boolean, unresolved: boolean}} */
function finish(type, valid, unresolved) {
  return {
    type,
    valid: valid && !isFailure(type),
    unresolved,
  };
}

/** @param {CalculationType} type @return {{type: CalculationType, valid: boolean, unresolved: boolean}} */
function resolved(type) {
  return finish(type, true, false);
}

/** @param {CalculationType} type @return {{type: CalculationType, valid: boolean, unresolved: boolean}} */
function markUnresolved(type) {
  return finish(type, true, true);
}

/** @param {CalculationType} type @return {AnalysisType} */
function publicType(type) {
  if (type.kind === 'number') return 'number';
  if (type.kind === 'unknown' || type.kind === 'failure') return 'unknown';
  return { dimension: type.base };
}

export { analyze };
