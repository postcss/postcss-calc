declare const _exports: {
    simplifyLog: typeof simplifyLog;
};
export = _exports;
export type Node = import('../node.js').Node;
/** @typedef {import('../node.js').Node} Node */
/**
 * @param {Node[]} args
 * @return {Node}
 */
declare function simplifyLog(args: Node[]): Node;
