export type Node = import("../node.js").Node;
/**
 * @param {'asin' | 'acos' | 'atan'} name
 * @param {Node[]} args
 * @return {Node}
 */
export function simplifyInverseTrig(name: "asin" | "acos" | "atan", args: Node[]): Node;
