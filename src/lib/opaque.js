/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./node.js').OpaqueComponent} OpaqueComponent */

/** @param {OpaqueComponent[]} components @param {(node: Node) => Node} simplify @return {OpaqueComponent[]} */
function simplifyComponents(components, simplify) {
  return components.map((part) => {
    if (typeof part === 'string') return part;
    if (Array.isArray(part)) return simplifyComponents(part, simplify);
    return simplify(part);
  });
}
/** @param {OpaqueComponent[]} components @param {(node: Node) => string} serialize @return {string} */
function serializeComponents(components, serialize) {
  let result = '';
  for (const part of components) {
    if (typeof part === 'string') result += part;
    else if (Array.isArray(part))
      result += serializeComponents(part, serialize);
    else result += serialize(part);
  }
  return result;
}
export { simplifyComponents, serializeComponents };
