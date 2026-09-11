// Private metadata for opaque function contents (including var() fallbacks).
// Keeping it in a WeakMap means the public calculation AST remains unchanged.
/** @typedef {import('./node.js').Node} Node */
/** @typedef {string | Node | Component[]} Component */
/** @type {WeakMap<Extract<Node, {type: 'Call'}>, Component[]>} */
const components = new WeakMap();
/** @param {Extract<Node, {type: 'Call'}>} node @param {Component[]} tree */
function setComponents(node, tree) {
  components.set(node, tree);
  return node;
}
/** @param {Extract<Node, {type: 'Call'}>} node */
function getComponents(node) {
  return components.get(node);
}
/** @param {Component[]} tree @param {(node: Node) => Node} simplify @return {Component[]} */
function simplifyComponents(tree, simplify) {
  return tree.map((part) => {
    if (typeof part === 'string') return part;
    if (Array.isArray(part)) return simplifyComponents(part, simplify);
    return simplify(part);
  });
}
/** @param {Component[]} tree @param {(node: Node) => string} serialize @return {string} */
function serializeComponents(tree, serialize) {
  let result = '';
  for (const part of tree) {
    if (typeof part === 'string') result += part;
    else if (Array.isArray(part))
      result += serializeComponents(part, serialize);
    else result += serialize(part);
  }
  return result;
}
export {
  getComponents,
  setComponents,
  simplifyComponents,
  serializeComponents,
};
