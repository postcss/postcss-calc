/**
 * Module dependencies.
 */
var reduceCSSCalc = require("reduce-css-calc")
var helpers = require("postcss-message-helpers")
var postcss = require("postcss")

var CONTAINS_CALC = /calc\(.*\)/

/**
 * PostCSS plugin to reduce calc() function calls.
 */
module.exports = postcss.plugin("postcss-calc", function(options) {
  options = options || {}
  var precision = options.precision
  var preserve = options.preserve
  var warnWhenCannotResolve = options.warnWhenCannotResolve

  return function(style, result) {

    style.walkDecls(function transformDecl(decl) {
      if (!decl.value || decl.value.indexOf("calc(") === -1) {
        return
      }

      helpers.try(function transformCSSCalc() {
        var value = reduceCSSCalc(decl.value, precision)

        if (warnWhenCannotResolve && CONTAINS_CALC.test(value)) {
          result.warn("Could not reduce expression: " + decl.value,
            {plugin: "postcss-calc", node: decl})
        }

        if (!preserve) {
          decl.value = value
          return
        }

        if (value != decl.value) {
          var clone = decl.clone()
          clone.value = value
          decl.parent.insertBefore(decl, clone)
        }
      }, decl.source)
    })
  }
})
