export type RoundStrategy = "nearest" | "up" | "down" | "to-zero";
export type Node = import("../node.js").Node;
/** @typedef {'nearest' | 'up' | 'down' | 'to-zero'} RoundStrategy */
/**
 * @param {Node[]} args
 * @return {Node}
 */
export function simplifyRound(args: Node[]): Node;
