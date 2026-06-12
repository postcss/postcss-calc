import type { Node } from '../../../lib/node.js';

/**
 * Render an AST as an S-expression for snapshot assertions. Makes the
 * canonical n-ary shape of Sum / Product visible at a glance:
 *
 *   (+ 1 2 3)                         — three-term Sum
 *   (+ 1 (- 2) 3)                     — `1 - 2 + 3`
 *   (* 2 3 (/ x))                     — `2 * 3 / x`
 */
export function sexpr(node: Node): string {
  switch (node.type) {
    case 'Num':
      return String(node.value);
    case 'Dim':
      return `${node.value}${node.unit}`;
    case 'Ident':
      return node.name;
    case 'Sum': {
      const parts = node.terms.map((t) =>
        t.sign === 1 ? sexpr(t.node) : `(- ${sexpr(t.node)})`
      );
      return `(+ ${parts.join(' ')})`;
    }
    case 'Product': {
      const parts = node.factors.map((f) =>
        f.exponent === 1 ? sexpr(f.node) : `(/ ${sexpr(f.node)})`
      );
      return `(* ${parts.join(' ')})`;
    }
    case 'Call':
      return node.args.length === 0
        ? `(${node.name})`
        : `(${node.name} ${node.args.map(sexpr).join(' ')})`;
  }
}
