// Spec: https://www.w3.org/TR/css-values-4/#calc-simplification
// One top-down pass over a canonical AST. Per-concern fold modules in
// ./simplify/; this file is the entry + dispatch only.

import type { Node } from './node.ts';
import { simplifySum } from './simplify/sum.ts';
import { simplifyProduct } from './simplify/product.ts';
import { simplifyCall } from './simplify/call.ts';

export type { SimplifyOptions } from './simplify/types.ts';
import type { SimplifyOptions } from './simplify/types.ts';

export function simplify(node: Node, options: SimplifyOptions = {}): Node {
  switch (node.type) {
    case 'Num':
    case 'Dim':
    case 'Ident':
      return node;
    case 'Call':
      return simplifyCall(node, options, simplify);
    case 'Sum':
      return simplifySum(node, options, simplify);
    case 'Product':
      return simplifyProduct(node, options, simplify);
  }
}
