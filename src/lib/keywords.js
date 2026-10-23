/** @typedef {import('./node.js').Node} Node */

/** @param {Node} node @param {number} index @return {boolean} */
function isClampKeyword(node, index) {
  return (
    (index === 0 || index === 2) &&
    node.type === 'Ident' &&
    node.name.toLowerCase() === 'none'
  );
}

export { isClampKeyword };
