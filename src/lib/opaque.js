/** @typedef {import('./node.js').Node} Node */
/** @typedef {import('./node.js').OpaqueComponent} OpaqueComponent */

/**
 * @param {OpaqueComponent[]} components
 * @param {(node: Node) => Node} simplify
 * @return {OpaqueComponent[]}
 */
function simplifyComponents(components, simplify) {
  return components.map((part) =>
    Array.isArray(part) ? part : simplify(part)
  );
}

export { simplifyComponents };
