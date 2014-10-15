/**
 * Module dependencies.
 */
var reduceCSSCalc = require("reduce-css-calc")

/**
 * PostCSS plugin to reduce calc() function calls.
 */
module.exports = function plugin() {
  return function(style) {
    style.eachDecl(function transformDecl(dec) {
      if (!dec.value) {
        return
      }

      try {
        dec.value = transform(dec.value)
      }
      catch (err) {
        err.message = gnuMessage(err.message, dec.source)
        throw err
      }
    })
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

/**
 * return GNU style message
 *
 * @param {String} message
 * @param {Object} source
 */
function gnuMessage(message, source) {
  return (source ? (source.file ? source.file : "<css input>") + ":" + source.start.line + ":" + source.start.column : "") + " " + message
}
