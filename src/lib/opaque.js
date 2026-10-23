/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./node.js').OpaqueComponent} OpaqueComponent */

/**
 * @param {OpaqueComponent[]} components
 * @param {(node: Node) => Node} simplify
 * @return {OpaqueComponent[]}
 */
function simplifyComponents(components, simplify) {
  return components.map((part) =>
    typeof part === 'string' ? part : simplify(part)
  );
}

/**
 * @param {OpaqueComponent[]} components
 * @param {string[]} buffer
 * @param {(node: Node, buffer: string[]) => void} serialize
 * @return {void}
 */
function serializeComponents(components, buffer, serialize) {
  for (const part of components) {
    if (typeof part === 'string') buffer.push(part);
    else serialize(part, buffer);
  }
}

export { simplifyComponents, serializeComponents };
