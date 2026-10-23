export type Node = import('../node.js').Node;
/** @typedef {import('../node.js').Node} Node */
/**
 * @param {Node[]} args
 * @param {string} name
 * @return {Node}
 */
declare function simplifyMinMax(args: Node[], name: string): Node;
export { simplifyMinMax };
