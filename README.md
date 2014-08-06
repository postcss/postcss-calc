# postcss-calc [![Build Status](https://travis-ci.org/postcss/postcss-calc.png)](https://travis-ci.org/postcss/postcss-calc)

A [PostCSS](https://github.com/postcss/postcss) plugin to reduce `calc()` usage.

Particularly useful with the [postcss-custom-properties](https://github.com/postcss/postcss-custom-properties)

## Installation

```bash
npm install postcss-calc
```

## Usage


```javascript
var postcss = require("postcss")
var calc = require("postcss-calc")

var css = postcss()
  .use(calc())
  .process(cssString)
  .css
```

## Supported feature

This reduce `calc()` references whenever it's possible.
This can be particularly useful with the [postcss-custom-properties](https://github.com/postcss/postcss-custom-properties) plugin.

**Note:** When multiple units are mixed together in the same expression, the `calc()` statement is left as is, to fallback to the [w3c calc() feature](http://www.w3.org/TR/css3-values/#calc).

**Example** (with [postcss-custom-properties](https://github.com/postcss/postcss-custom-properties) enabled as well):

```js
// dependencies
var fs = require("fs")
var postcss = require("postcss")
var customProperties = require("postcss-custom-properties")
var calc = require("postcss-calc")

// css to be processed
var css = fs.readFileSync("style.css", "utf8")

var output = postcss()
  .use(customProperties())
  .use(calc())
  .process(css)
  .css
```

```css
:root {
  --main-font-size: 16px;
}

body {
  font-size: var(--main-font-size);
}

h1 {
  font-size: calc(var(--main-font-size) * 2);
  height: calc(100px - 2em);
}
```

yields:

```css
body {
  font-size: 16px
}

h1 {
  font-size: 32px;
  height: calc(100px - 2em)
}
```

See [unit tests](test) for a better example.

---

## Contributing

Work on a branch, install dev-dependencies, respect coding style & run tests before submitting a bug fix or a feature.

```bash
git clone https://github.com/postcss/postcss-calc.git
git checkout -b patch-1
npm install
npm test
```

## [Changelog](CHANGELOG.md)

## [License](LICENSE-MIT)
