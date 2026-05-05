import type { Node } from '../node.ts';

export interface SimplifyOptions {
  /**
   * Reorder commutative operands by input position rather than the
   * default canonical (numeric-first, then by-discovery, then opaque)
   * shape. Operates on outer-expression positions only — flattened
   * sub-expressions share their parent's position.
   */
  preserveOrder?: boolean;
  /**
   * Drop zero-valued unit buckets from a Sum when other terms in the
   * same sum already carry type info. Off by default — WPT and the
   * round-trip property require zero buckets to be preserved.
   */
  dropZeroIdentities?: boolean;
}

/** Recursive simplifier reference, threaded into Sum/Product/Call. Lets
 *  leaf fold modules avoid circular imports of the entry function. */
export type SimplifyFn = (node: Node, options: SimplifyOptions) => Node;
