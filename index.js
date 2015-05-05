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

  function transformRule(rule, prop) {
    if (!rule[prop] || rule[prop].indexOf("calc(") === -1) {
      return
    }
    helpers.try(function transformCSSCalc() {
      var value = reduceCSSCalc(rule[prop], precision)

      if (!preserve) {
        rule[prop] = value
        return
      }

      if (value != rule[prop]) {
        var clone = rule.clone()
        clone[prop] = value
        rule.parent.insertBefore(rule, clone)
      }
    }, rule.source)
  }
  
  return function(style) {
    style.eachInside(function (rule) {
      switch (rule.type) {
        case "decl":
          transformRule(rule, "value")
          break;
        case "atrule":
          transformRule(rule, "params")
          break;
      }
    })
  }
}
