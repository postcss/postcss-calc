import type { Node } from '../node.ts';

/** Recursive simplifier reference, threaded into Sum/Product/Call. Lets
 *  leaf fold modules avoid circular imports of the entry function. */
export type SimplifyFn = (node: Node) => Node;
