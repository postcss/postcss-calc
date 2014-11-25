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
  var precision = options.precision
  var preserve = options.preserve

  return function(style) {
    style.eachDecl(function transformDecl(decl) {
      if (!decl.value || decl.value.indexOf("calc(") === -1) {
        return
      }

      helpers.try(function transformCSSCalc() {
        var value = reduceCSSCalc(decl.value, precision)

        if (!preserve) {
          decl.value = value
          return
        }

        var clone = decl.clone()
        clone.value = value
        decl.parent.insertBefore(decl, clone)
      }, decl.source)
    })
  }
}
