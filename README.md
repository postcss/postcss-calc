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

## PostCSS usage

```js
// dependencies
var fs = require('fs');
var postcss = require('postcss');
var calc = require('postcss-calc');

// css to be processed
var css = fs.readFileSync('input.css', 'utf8');

// process css
var output = postcss().use(calc()).process(css).css;
```

Using this `input.css`:

```css
h1 {
  font-size: calc(16px * 2);
  height: calc(100px - 2em);
  width: calc(2 * var(--base-width));
  margin-bottom: calc(16px * 1.5);
}
```

you will get:

```css
h1 {
  font-size: calc(32px);
  height: calc(100px - 2em);
  width: calc(2 * var(--base-width));
  margin-bottom: calc(24px);
}
```

Checkout [tests] for more examples.

## Use the reducer without PostCSS

For a single CSS component-value string, import the dedicated reducer entry
point. It reduces `calc()` and the supported CSS math functions it finds while
leaving all other text untouched.

```js
import reduceCalc from 'postcss-calc/reduce';

reduceCalc('calc(1in + 10px)');
// => 'calc(1.10417in)'

reduceCalc('min(50px, calc(2 * 40px))');
// => 'calc(50px)'
```

It accepts `precision`, `unwrapSingleValue`, the deprecated
`unwrapSingleNegativeNumber` alias,
`warnWhenCannotResolve`, `onParseError`, and `onWarn`:

```js
const result = reduceCalc('calc(100% + var(--gap))', {
  precision: false,
  warnWhenCannotResolve: true,
  onWarn: console.warn,
  onParseError(error, input) {
    console.error(`Invalid calculation: ${input}`, error);
  },
});
```

Unlike the PostCSS plugin, the standalone reducer does not show warnings
by default; provide `onParseError` and/or `onWarn` if you want diagnostics.

### Standalone reducer options

#### `unwrapSingleValue` (default: `false`)

Serializes a fully resolved finite scalar result without calculation syntax.
Keep the default for standard CSS so the browser can perform range clamping
and integer rounding. Set it to `true` for a non-standard context that requires
a bare value, such as a selector:

```js
reduceCalc('calc(5px - 10px)');
// => 'calc(-5px)'

reduceCalc('calc(5px - 10px)', { unwrapSingleValue: true });
// => '-5px'

reduceCalc('calc(1 / 2)', { unwrapSingleValue: true });
// => '.5'
```

The published `unwrapSingleNegativeNumber` option is retained as a deprecated
alias for `unwrapSingleValue`.

### PostCSS plugin options

These options apply when using the PostCSS plugin:

```js
postcss().use(calc({ precision: 10 }));
```

#### `precision` (default: `5`)

Allows you to define the precision for decimal numbers. Set it to `false` to
disable rounding and preserve full IEEE-754 floating-point precision (emitting
the shortest round-tripping decimal representation).

```js
var out = postcss()
  .use(calc({ precision: 10 }))
  .process(css).css;
```

#### `unwrapSingleValue` (default: `false`)

Serializes fully resolved finite scalar results without calculation syntax.
This can discard browser-applied range clamping or integer rounding. Selectors
enable it automatically because selectors cannot contain `calc()`.

#### `warnWhenCannotResolve` (default: `false`)

Adds warnings when calc() are not reduced to a single value.

```js
var out = postcss()
  .use(calc({ warnWhenCannotResolve: true }))
  .process(css).css;
```

#### `mediaQueries` (default: `false`)

Allows calc() usage in media query parameters.

```js
var out = postcss()
  .use(calc({ mediaQueries: true }))
  .process(css).css;
```

Example:

```css
@media (min-width: calc(100px + 100px)) {
  div {
    width: 100px;
  }
}
```

With `mediaQueries: true`, this becomes:

```css
@media (min-width: 200px) {
  div {
    width: 100px;
  }
}
```

#### `selectors` (default: `false`)

Reduces `calc()` functions found in selectors. Selectors do not accept
`calc()` functions, so the plugin replaces them with their reduced values.
Finite negative and fractional unitless results are serialized as bare values
because a selector cannot contain a `calc()` function; the plugin enables the
`unwrapSingleValue` automatically for selectors.

```js
var out = postcss()
  .use(calc({ selectors: true }))
  .process(css).css;
```

Example:

```css
div:nth-child(calc(1 + 2)) {
  width: 100px;
}
```

With `selectors: true`, this becomes `div:nth-child(3)`.

#### `onParseError`

Callback invoked when a `calc()` body fails to parse or simplify. Matches
[`@csstools/css-calc`][csstools-css-calc]'s shape:

```js
postcss().use(
  calc({
    onParseError: (err, input) => {
      throw err; // or log, route to a different channel, etc.
    },
  })
);
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

The normal test run uses a deterministic structural sample of the harvested
real-world corpus. Run the complete differential corpus before releases or
when changing parsing/simplification behavior:

```bash
pnpm test:corpus:full
```

Profile parser chains with `pnpm benchmark:arithmetic-chains` or
`pnpm benchmark:nested-fallbacks`; both use 20 fresh paired blocks by default
and write ignored schema-v2 reports. Compare a saved report with
`node scripts/compare-parser-benchmarks.js <report>`. Run the correctness-aware
corpus benchmark with `pnpm benchmark:corpus`.

The PostCSS benchmark awaits `postcss().process(...)`, and that await already
triggers result stringification. It therefore does not add a redundant
`result.css` access.

## [Changelog](CHANGELOG.md)

## [License](LICENSE)

[git-img]: https://img.shields.io/badge/support-chat-blue.svg
[git-url]: https://gitter.im/postcss/postcss
[npm-img]: https://img.shields.io/npm/v/postcss-calc.svg
[npm-url]: https://www.npmjs.com/package/postcss-calc
[PostCSS]: https://github.com/postcss
[PostCSS Calc]: https://github.com/postcss/postcss-calc
[PostCSS Custom Properties]: https://github.com/postcss/postcss-custom-properties
[tests]: test/
[W3C calc() implementation]: https://www.w3.org/TR/css3-values/#calc-notation
