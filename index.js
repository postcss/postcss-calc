/**
 * Module dependencies.
 */
var reduceCSSCalc = require("reduce-css-calc")

/**
 * Expose `plugin`.
 */

module.exports = plugin

/**
 * Plugin to convert all function calls.
 *
 * @param {Object} stylesheet
 */

function plugin() {
  return function(style) {
    style.eachDecl(function declaration(dec) {
      if (!dec.value) {
        return
      }

      try {
        dec.value = convert(dec.value)
      }
      catch (err) {
        err.position = dec.position
        throw err
      }
    })
  }
}

/**
 * Reduce CSS calc()
 *
 * @param {String} string
 * @return {String}
 */

function convert(string) {
  if (string.indexOf("calc(") === -1) {
    return string
  }

  return reduceCSSCalc(string)
}
