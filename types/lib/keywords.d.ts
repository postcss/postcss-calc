/** @typedef {import('./node.js').Node} Node */
export type Node = import('./node.js').Node;
/** @param {Node} node @param {number} index @return {boolean} */
declare function isClampKeyword(node: Node, index: number): boolean;
export { isClampKeyword };
