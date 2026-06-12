export type Node = import("../node.js").Node;
/** @typedef {import('../node.js').Node} Node */
/**
 * @param {string} name
 * @param {Node[]} args
 * @return {Node}
 */
export function simplifyMinMax(name: string, args: Node[]): Node;
