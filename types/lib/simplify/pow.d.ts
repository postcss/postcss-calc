declare const _exports: {
    simplifyPow: typeof simplifyPow;
};
export = _exports;
export type Node = import('../node.js').Node;
/** @typedef {import('../node.js').Node} Node */
/**
 * @param {Node[]} args
 * @return {Node}
 */
declare function simplifyPow(args: Node[]): Node;
