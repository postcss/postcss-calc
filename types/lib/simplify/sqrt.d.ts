declare const _exports: {
    simplifySqrt: typeof simplifySqrt;
};
export = _exports;
export type Node = import('../node.js').Node;
/** @typedef {import('../node.js').Node} Node */
/**
 * @param {Node[]} args
 * @return {Node}
 */
declare function simplifySqrt(args: Node[]): Node;
