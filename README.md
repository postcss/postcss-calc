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

#### `strictWhitespace` (default: `true`)

Reject inputs that don't follow [CSS Values 4 §10.1][css-values-4-syntax]'s
whitespace rule around binary `+` / `-`. With the default, `calc(2px+3px)`
is rejected (it tokenizes as `[2px, +, 3px]` but lacks whitespace around
the `+`). Set to `false` to recover jison-era lenient parsing.

```js
calc({strictWhitespace: false})
```

#### `preserveOrder` (default: `false`)

Preserve input order of commutative operands rather than reordering to the
canonical (numeric-first, then by-discovery, then opaque) shape that
[`@csstools/css-calc`][csstools-css-calc] also uses.

```js
calc({preserveOrder: true})
```

| Input | Default | `preserveOrder: true` |
|---|---|---|
| `calc(var(--foo) + 10px)` | `calc(10px + var(--foo))` | `calc(var(--foo) + 10px)` |
| `calc(1px + 1)` | `calc(1 + 1px)` | `calc(1px + 1)` |
| `calc(var(--m) * 1px)` | `calc(1px * var(--m))` | `calc(var(--m) * 1px)` |

`preserveOrder` operates on outer-expression positions; nested-sum
flattening, constant folding, and reciprocal conversion (`a / 2` →
`a * 0.5`) all collapse positions before assembly and can't be recovered.

#### `dropZeroIdentities` (default: `false`)

Drop `+ 0px` / `+ 0em` identities from sums when another term in the same
sum already carries the type. The default preserves zero-valued buckets
because [WPT calc-serialization-002][wpt-calc-serialization] and the
round-trip property both require it (`calc(0px + 100%)` is a length-
percentage; collapsing to `100%` loses the type signal).

```js
calc({dropZeroIdentities: true})
```

| Input | Default | `dropZeroIdentities: true` |
|---|---|---|
| `calc(100px - (100px - 100%))` | `calc(0px + 100%)` | `100%` |
| `calc(99.99% * 1/1 - 0rem)` | `calc(99.99% + 0rem)` | `99.99%` |
| `calc((100px - 1em) + (-50px + 1em))` | `calc(50px + 0em)` | `50px` |

### Behavior differences from the legacy parser

The legacy [jison][jison]-generated parser was replaced by a hand-written
Pratt parser whose simplifier follows [CSS Values 4][css-values-4]. Most
inputs reduce to identical output, but some legacy results were jison
implementation choices rather than spec-required behavior. The three
opt-in flags above recover the most visible differences. Setting all
three matches the legacy output as closely as possible:

```js
calc({
  strictWhitespace: false,
  preserveOrder: true,
  dropZeroIdentities: true,
})
```

A handful of behaviors aren't flag-controlled — they're spec-aligned
or canonical-form decisions:

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

[css-values-4]: https://www.w3.org/TR/css-values-4/
[css-values-4-syntax]: https://www.w3.org/TR/css-values-4/#calc-syntax
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
