/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./node.js').OpaqueComponent} OpaqueComponent */
export type Node = import('./node.js').Node;
export type OpaqueComponent = import('./node.js').OpaqueComponent;
/** @param {OpaqueComponent[]} components @param {(node: Node) => Node} simplify @return {OpaqueComponent[]} */
declare function simplifyComponents(components: OpaqueComponent[], simplify: (node: Node) => Node): OpaqueComponent[];
/** @param {OpaqueComponent[]} components @param {(node: Node) => string} serialize @return {string} */
declare function serializeComponents(components: OpaqueComponent[], serialize: (node: Node) => string): string;
export { simplifyComponents, serializeComponents };
