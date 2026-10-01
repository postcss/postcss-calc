import { simplify } from '../../src/lib/simplify.js';
import { serialize } from '../../src/lib/serialize.js';

export const NUM_RUNS = 500;

/** Serialize simplified AST at algebraic property precision (10 decimal places). */
export const outAst = (node) => serialize(simplify(node), { precision: 10 });
