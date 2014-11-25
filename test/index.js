var fs = require("fs")

var test = require("tape")
var postcss = require("postcss")
var customProperties = require("postcss-custom-properties")
var calc = require("..")

function fixturePath(name) {
  return "test/fixtures/" + name + ".css"
}

function fixture(name) {
  return fs.readFileSync(fixturePath(name), "utf8").trim()
}

function compareFixtures(t, name, options, message) {
  var actual = postcss()
    .use(customProperties())
    .use(calc(options))
    .process(fixture(name), {from: fixturePath(name)})
    .css.trim()

  // handy thing: checkout actual in the *.actual.css file
  fs.writeFile(fixturePath(name + ".actual"), actual)

  return t.equal(actual, fixture(name + ".expected"), message ? message : "processed fixture '" + name + "' should be equal to expected output")
}

test("calc", function(t) {
  compareFixtures(t, "calc", {}, "should resolve what is possible in complex calc")

  compareFixtures(t, "precision", {precision: 3}, "should have a precision option that allow to control decimal precision of calcuations")

  compareFixtures(t, "preserve", {preserve: true}, "should have a preserve option that allow to keep original calc() usage")

  t.end()
})
