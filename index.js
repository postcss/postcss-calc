/**
 * Module dependencies.
 */
var reduceCssCalc = require("reduce-css-calc")

/**
 * Expose `plugin`.
 */

module.exports = plugin

/**
 * Plugin to convert CSS color functions.
 *
 * @param {Object} stylesheet
 */

function plugin(style) {
  style.eachRule(rule)
}

/**
 * Convert an entire `rule`.
 *
 * @param {Object} rule
 */

function rule(obj) {
  obj.each(declaration)
}

/**
 * Convert a declaration.
 *
 * @param {Object} dec
 */

function declaration(dec) {
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
}

/**
 * Reduce css calc()
 *
 * @param {String} string
 * @return {String}
 */

function convert(string) {
  if (string.indexOf("calc(") === -1) {
    return string
  }

  return reduceCssCalc(string)
}
