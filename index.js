/**
 * Module dependencies.
 */
var reduceCSSCalc = require("reduce-css-calc")
var helpers = require("postcss-message-helpers")

/**
 * PostCSS plugin to reduce calc() function calls.
 */
module.exports = function plugin(options) {
  options = options || {}

  return function(style) {
    style.eachDecl(function transformDecl(decl) {
      if (!decl.value) {
        return
      }

      decl.value = helpers.try(function transformCSSCalc() {
        if (decl.value.indexOf("calc(") === -1) {
          return decl.value
        }

        return reduceCSSCalc(decl.value, options.precision)
      })
    })
  }
}
