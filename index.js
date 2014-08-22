/**
 * Module dependencies.
 */
var reduceCSSCalc = require("reduce-css-calc")

/**
 * Expose plugin & helper
 */
module.exports = plugin
module.exports.transformDecl = transformDecl

/**
 * PostCSS plugin to reduce calc() function calls.
 */
function plugin() {
  return function(style) {
    style.eachDecl(transformDecl)
  }
}

/**
 * Reduce CSS calc on a declaration object
 *
 * @param {object} dec [description]
 */
function transformDecl(dec) {
  if (!dec.value) {
    return
  }

  try {
    dec.value = transform(dec.value)
  }
  catch (err) {
    err.position = dec.position
    throw err
  }
}

/**
 * Reduce CSS calc() on a declaration value
 *
 * @param {String} string
 * @return {String}
 */
function transform(string) {
  if (string.indexOf("calc(") === -1) {
    return string
  }

  return reduceCSSCalc(string)
}
