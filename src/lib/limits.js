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
      // Components sit one level below the call, and a node component one
      // level deeper again. This keeps the accepted depth unchanged from when
      // components were nested arrays.
      for (const part of node.components) {
        assertDepth(depth + 1);
        if (typeof part !== 'string') checkCalculationDepth(part, depth + 2);
      }
  }
}

export { MAX_CALCULATION_DEPTH, assertDepth, checkCalculationDepth };
