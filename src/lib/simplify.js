// Spec: https://www.w3.org/TR/css-values-4/#calc-simplification
// One top-down pass over a canonical AST. Per-concern fold modules in
// ./simplify/; this file is the entry + dispatch only.

import { simplifySum } from './simplify/sum.js';
import { simplifyProduct } from './simplify/product.js';
import { simplifyCall } from './simplify/call.js';
import { simplifyComponents } from './opaque.js';
import { opaqueCall } from './node.js';
import { assertDepth } from './limits.js';

/**
 * @typedef {import('./node.js').Node} Node
 *
 * Recursive simplifier reference, threaded into Sum/Product/Call/OpaqueCall. Lets
 * leaf fold modules avoid circular imports of the entry function.
 * @typedef {(node: Node) => Node} SimplifyFn
 */

/**
 * Simplify is an independent, composable AST transformation. It may
 * synthesize canonical nodes while preserving the Node -> Node contract.
 * @param {Node} node
 * @param {number} [depth]
 * @return {Node}
 */
function simplify(node, depth = 0) {
  assertDepth(depth);
  /** @param {Node} value */
  const child = (value) => simplify(value, depth + 1);
  switch (node.type) {
    case 'Num':
    case 'Dim':
    case 'Ident':
      return node;
    case 'Call':
      return simplifyCall(node, child);
    case 'OpaqueCall':
      return opaqueCall(
        node.name,
        simplifyComponents(node.components, child),
        node.rawName
      );
    case 'Sum':
      return simplifySum(node, child);
    case 'Product':
      return simplifyProduct(node, child);
  }
}

export { simplify };
