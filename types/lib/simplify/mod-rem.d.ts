export type Node = import("../node.js").Node;
/** @typedef {import('../node.js').Node} Node */
/**
 * @param {'mod' | 'rem'} name
 * @param {Node[]} args
 * @return {Node}
 */
export function simplifyModRem(name: "mod" | "rem", args: Node[]): Node;
