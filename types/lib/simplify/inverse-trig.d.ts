export type Node = import('../node.js').Node;
/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
declare function simplifyInverseTrig(args: Node[], name: string): Node;
export { simplifyInverseTrig };
