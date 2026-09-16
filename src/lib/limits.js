/** @typedef {import('./node.js').Node} Node */

const MAX_CALCULATION_DEPTH = 1024;

/** @param {number} depth @return {void} */
function assertDepth(depth) {
  if (depth > MAX_CALCULATION_DEPTH) {
    throw new Error(
      `Calculation nesting exceeds the limit of ${MAX_CALCULATION_DEPTH}`
    );
  }
}

/** @param {unknown} part @param {number} depth @return {void} */
function checkOpaquePartDepth(part, depth) {
  assertDepth(depth);
  if (typeof part === 'string') return;
  if (Array.isArray(part)) {
    for (const child of part) checkOpaquePartDepth(child, depth + 1);
    return;
  }
  checkCalculationDepth(/** @type {Node} */ (part), depth + 1);
}

/** @param {Node} node @param {number} [depth] @return {void} */
function checkCalculationDepth(node, depth = 0) {
  assertDepth(depth);
  switch (node.type) {
    case 'Sum':
      for (const term of node.terms) {
        checkCalculationDepth(term.node, depth + 1);
      }
      return;
    case 'Product':
      for (const factor of node.factors) {
        checkCalculationDepth(factor.node, depth + 1);
      }
      return;
    case 'Call':
      for (const child of node.args) checkCalculationDepth(child, depth + 1);
      return;
    case 'OpaqueCall':
      for (const part of node.components) {
        checkOpaquePartDepth(part, depth + 1);
      }
  }
}

export { MAX_CALCULATION_DEPTH, assertDepth, checkCalculationDepth };
