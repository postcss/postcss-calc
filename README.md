# PostCSS Calc [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS" width="90" height="90" align="right">][PostCSS]

[![NPM Version][npm-img]][npm-url]
[![Support Chat][git-img]][git-url]

[PostCSS Calc] lets you reduce `calc()` references whenever it's possible.
When multiple units are mixed together in the same expression, the `calc()`
statement is left as is, to fallback to the [W3C calc() implementation].

## Installation

```bash
npm install postcss-calc
```

## Usage

```js
// dependencies
var fs = require("fs")
var postcss = require("postcss")
var calc = require("postcss-calc")

// css to be processed
var css = fs.readFileSync("input.css", "utf8")

// process css
var output = postcss()
  .use(calc())
  .process(css)
  .css
```

Using this `input.css`:

```css
h1 {
  font-size: calc(16px * 2);
  height: calc(100px - 2em);
  width: calc(2*var(--base-width));
  margin-bottom: calc(16px * 1.5);
}
```

you will get:

```css
h1 {
  font-size: 32px;
  height: calc(100px - 2em);
  width: calc(2*var(--base-width));
  margin-bottom: 24px
}
```
Checkout [tests] for more examples.

### Options

#### `precision` (default: `5`)

Allow you to define the precision for decimal numbers.

```js
var out = postcss()
  .use(calc({precision: 10}))
  .process(css)
  .css
```

#### `preserve` (default: `false`)

Allow you to preserve calc() usage in output so browsers will handle decimal
precision themselves.

```js
var out = postcss()
  .use(calc({preserve: true}))
  .process(css)
  .css
```

#### `warnWhenCannotResolve` (default: `false`)

Adds warnings when calc() are not reduced to a single value.

```js
var out = postcss()
  .use(calc({warnWhenCannotResolve: true}))
  .process(css)
  .css
```

#### `mediaQueries` (default: `false`)

Allows calc() usage as part of media query declarations.

```js
var out = postcss()
  .use(calc({mediaQueries: true}))
  .process(css)
  .css
```

#### `selectors` (default: `false`)

Allows calc() usage as part of selectors.

```js
var out = postcss()
  .use(calc({selectors: true}))
  .process(css)
  .css
```

Example:

```css
div[data-size="calc(3*3)"] {
  width: 100px;
}
```

#### `onParseError`

Callback invoked when a `calc()` body fails to parse or simplify. Matches
[`@csstools/css-calc`][csstools-css-calc]'s shape:

```js
calc({
  onParseError: (err, input) => {
    throw err; // or log, route to a different channel, etc.
  }
})
```

When omitted, errors are reported via PostCSS `result.warn()` so the
plugin never throws at the postcss level.

### Behavior differences from the legacy parser

The legacy [jison][jison]-generated parser was replaced by a hand-written
Pratt parser whose simplifier follows [CSS Values 4][css-values-4]. Most
inputs reduce to identical output; the differences are spec-aligned or
canonical-form decisions:

- **Strict whitespace (§10.1).** `calc(2px+3px)` is invalid CSS (binary
  `+` / `-` require surrounding whitespace) and is preserved with a
  warning instead of reduced.
- **Canonical operand order.** Commutative operands serialize
  numeric-first, matching [`@csstools/css-calc`][csstools-css-calc]:
  `calc(var(--foo) + 10px)` → `calc(10px + var(--foo))`.
- **Zero buckets are kept.** `calc(100px - (100px - 100%))` →
  `calc(0px + 100%)`, not `100%` — [WPT calc-serialization-002][wpt-calc-serialization]
  requires the zero term because it carries the length-percentage type.
- **Constant folding.** `calc(43 + pi)` now folds to `46.14159` (§10.7.1).
  Previously `pi` / `e` stayed symbolic.
- **Reciprocal conversion.** `calc(var(--x) / 2)` becomes
  `calc(var(--x) * 0.5)`. The two are mathematically equivalent;
  previously the division shape was kept.
- **Distributive multiplication.** `calc(0.5 * (100vw - 10px))` becomes
  `calc(50vw - 5px)`.
- **Unit case normalization.** `2PX` becomes `2px` (CSS units are case-
  insensitive; lowercase is conventional).
- **Calc unwrap (§10.6).** `calc(var(--foo))` becomes `var(--foo)` — a
  `calc()` containing a single value is replaced by that value.
- **Spec-style spaced operators.** `2px*var(--x)` is serialized as
  `2px * var(--x)`. The tokenizer is unaffected; only output spacing
  differs.
- **Division by zero / by a unit.** `calc(500px/0)` reduces to
  `calc(infinity * 1px)` (§10.13) instead of throwing. Use `onParseError`
  if you want validation behavior.

[css-values-4]: https://www.w3.org/TR/css-values-4/
[csstools-css-calc]: https://www.npmjs.com/package/@csstools/css-calc
[wpt-calc-serialization]: https://github.com/web-platform-tests/wpt/blob/master/css/css-values/calc-serialization-002.html
[jison]: https://github.com/zaach/jison

---

## Related PostCSS plugins
To replace the value of CSS custom properties at build time, try [PostCSS Custom Properties].

## Contributing

Work on a branch, install dev-dependencies, respect coding style & run tests
before submitting a bug fix or a feature.

```bash
git clone git@github.com:postcss/postcss-calc.git
git checkout -b patch-1
npm install
npm test
```

## [Changelog](CHANGELOG.md)

## [License](LICENSE)

[git-img]: https://img.shields.io/badge/support-chat-blue.svg
[git-url]: https://gitter.im/postcss/postcss
[npm-img]: https://img.shields.io/npm/v/postcss-calc.svg
[npm-url]: https://www.npmjs.com/package/postcss-calc

[PostCSS]: https://github.com/postcss
[PostCSS Calc]: https://github.com/postcss/postcss-calc
[PostCSS Custom Properties]: https://github.com/postcss/postcss-custom-properties
[tests]: test/index.js
[W3C calc() implementation]: https://www.w3.org/TR/css3-values/#calc-notation
