declare const _exports: {
    simplifyHypot: typeof simplifyHypot;
};
export = _exports;
export type Node = import('../node.js').Node;
/** @typedef {import('../node.js').Node} Node */
/**
 * @param {Node[]} args
 * @return {Node}
 */
declare function simplifyHypot(args: Node[]): Node;
