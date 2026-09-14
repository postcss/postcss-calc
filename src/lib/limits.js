/** @typedef {import('./node.js').Node} Node */

const MAX_CALCULATION_DEPTH = 1024;

class CalculationLimitError extends Error {
  /** @param {number} limit */
  constructor(limit) {
    super(`Calculation nesting exceeds the limit of ${limit}`);
    this.name = 'CalculationLimitError';
    this.limit = limit;
  }
}

/** @param {number} depth @return {void} */
function assertDepth(depth) {
  if (depth > MAX_CALCULATION_DEPTH) {
    throw new CalculationLimitError(MAX_CALCULATION_DEPTH);
  }
}

/** @param {Node} node @param {number} [depth] @return {void} */
function checkCalculationDepth(node, depth = 0) {
  assertDepth(depth);
  const children = [];
  if (node.type === 'Sum')
    children.push(...node.terms.map((term) => term.node));
  if (node.type === 'Product')
    children.push(...node.factors.map((factor) => factor.node));
  if (node.type === 'Call') children.push(...node.args);
  if (node.type === 'OpaqueCall') {
    /** @param {unknown} part @param {number} partDepth */
    const visit = (part, partDepth) => {
      assertDepth(partDepth);
      if (typeof part === 'string') return;
      if (Array.isArray(part)) {
        for (const child of part) visit(child, partDepth + 1);
        return;
      }
      checkCalculationDepth(/** @type {Node} */ (part), partDepth + 1);
    };
    for (const part of node.components) visit(part, depth + 1);
  }
  for (const child of children) checkCalculationDepth(child, depth + 1);
}

export {
  MAX_CALCULATION_DEPTH,
  CalculationLimitError,
  assertDepth,
  checkCalculationDepth,
};
