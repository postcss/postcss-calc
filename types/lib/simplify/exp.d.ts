declare const _exports: {
    simplifyExp: typeof simplifyExp;
};
export = _exports;
export type Node = import('../node.js').Node;
/** @typedef {import('../node.js').Node} Node */
/**
 * @param {Node[]} args
 * @return {Node}
 */
declare function simplifyExp(args: Node[]): Node;
