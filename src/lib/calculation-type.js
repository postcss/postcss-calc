// Compatibility facade for the former calculation-type module. New code uses
// analyze() for the complete result and limits.js for depth policy.

import { analyze } from './analyze.js';
import { MAX_CALCULATION_DEPTH, checkCalculationDepth } from './limits.js';

/** @typedef {import('./node.js').Node} Node */

/** @typedef {{kind: 'number'} | {kind: 'dimension', base: string | null} | {kind: 'unknown'} | {kind: 'failure'}} CalculationType */

/** @param {Node} node @return {CalculationType} */
function checkCalculationType(node) {
  const result = analyze(node);
  if (!result.valid) return { kind: 'failure' };
  if (result.type === 'number') return { kind: 'number' };
  if (result.type === 'unknown') return { kind: 'unknown' };
  return { kind: 'dimension', base: result.type.dimension };
}

export {
  MAX_CALCULATION_DEPTH,
  checkCalculationDepth,
  checkCalculationType,
  analyze,
};
