declare const _exports: {
    simplifyInverseTrig: typeof simplifyInverseTrig;
};
export = _exports;
export type Node = import('../node.js').Node;
/**
 * @param {'asin' | 'acos' | 'atan'} name
 * @param {Node[]} args
 * @return {Node}
 */
declare function simplifyInverseTrig(name: 'asin' | 'acos' | 'atan', args: Node[]): Node;
