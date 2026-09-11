export type Node = import('./node.js').Node;
export type Component = string | Node | Component[];
/** @param {Extract<Node, {type: 'Call'}>} node @param {Component[]} tree */
declare function setComponents(node: Extract<Node, {
    type: 'Call';
}>, tree: Component[]): import("./node.js").Call;
/** @param {Extract<Node, {type: 'Call'}>} node */
declare function getComponents(node: Extract<Node, {
    type: 'Call';
}>): Component[] | undefined;
/** @param {Component[]} tree @param {(node: Node) => Node} simplify @return {Component[]} */
declare function simplifyComponents(tree: Component[], simplify: (node: Node) => Node): Component[];
/** @param {Component[]} tree @param {(node: Node) => string} serialize @return {string} */
declare function serializeComponents(tree: Component[], serialize: (node: Node) => string): string;
export { getComponents, setComponents, simplifyComponents, serializeComponents, };
