var test = require("tape")

var calc = require("..")

var read = require("fs").readFileSync
var postcss = require("postcss")
var customProperties = require("postcss-custom-properties")

function fixture(name) {
  return read("test/" + name + ".css", "utf8").trim()
}

test("resolve what is possible in complex calc", function(t) {
  var actual = postcss()
    .use(customProperties())
    .use(calc())
    .process(fixture("calc"))
    .css
    .trim()
  var expected = fixture("calc.out")
  t.equal(actual, expected)

  t.end()
})
