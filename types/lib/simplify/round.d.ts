export type Node = import('../node.js').Node;
/** @typedef {import('../node.js').Node} Node */
declare const ROUND_STRATEGIES: Set<string>;
export type RoundStrategy = 'nearest' | 'up' | 'down' | 'to-zero';
/** @typedef {'nearest' | 'up' | 'down' | 'to-zero'} RoundStrategy */
/**
 * @param {Node[]} args
 * @return {Node}
 */
declare function simplifyRound(args: Node[]): Node;
export { ROUND_STRATEGIES, simplifyRound };
