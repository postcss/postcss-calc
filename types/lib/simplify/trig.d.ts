export type Node = import('../node.js').Node;
/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
declare function simplifyTrig(args: Node[], name: string): Node;
export { simplifyTrig };
