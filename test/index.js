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
  var result = postcss()
    .use(customProperties())
    .use(calc(options))
    .process(fixture(name), {from: fixturePath(name)})
  var actual = result.css.trim()

  // handy thing: checkout actual in the *.actual.css file
  fs.writeFile(fixturePath(name + ".actual"), actual)

  t.equal(
    actual,
    fixture(name + ".expected"),
    message
      ? message
      : "processed fixture '" + name + "' should be equal to expected output"
  )

  return result
}

test("calc", function(t) {
  compareFixtures(
    t,
    "calc",
    {},
    "should resolve what is possible in complex calc"
  )

  compareFixtures(
    t,
    "media",
    {},
    "should resolve media queries"
  )

  compareFixtures(
    t,
    "precision",
    {precision: 3},
    "should have a precision option that allow to control decimal precision " +
      "of calcuations"
  )

  compareFixtures(
    t,
    "preserve",
    {preserve: true},
    "should have a preserve option that allow to keep original calc() usage"
  )

  compareFixtures(
    t,
    "preserve-media",
    {preserve: true},
    "should have a preserve option that allow to keep original calc() usage" +
    "with media"
  )

  var result = compareFixtures(
    t,
    "warnWhenCannotResolve",
    {warnWhenCannotResolve: true}
  )

  t.ok(
    result.messages[0].text.match(/^Could not reduce expression:/),
    "should add a warning for unreduced calc() "
  )

  t.end()
})
