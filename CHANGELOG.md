# [8.2.3](https://github.com/postcss/postcss-calc/compare/v8.2.2...v8.2.3) (2022-01-28)

## Bug Fixes

* improve types ([f2cce1b](https://github.com/postcss/postcss-calc/commit/f2cce1bc1d47af7ab02891c61b4c1485d6e6dfd3))

## [8.2.2](https://github.com/postcss/postcss-calc/compare/v8.2.1...v8.2.2) (2022-01-12)

## Bug Fixes

* respect CSS var when reducing ([99d9fa5](https://github.com/postcss/postcss-calc/commit/99d9fa53a7fba3586590d0c45a0982b09e8bf5c6))

# [8.2.1](https://github.com/postcss/postcss-calc/compare/v8.2.0...v8.2.1) (2022-01-11)

## Bug Fixes

* preserve brackets around functions ([0b70a1d](https://github.com/postcss/postcss-calc/commit/0b70a1d5773f17373991b1294e3ae618600aae7d)), closes [#113](https://github.com/postcss/postcss-calc/issues/113) [#115](https://github.com/postcss/postcss-calc/issues/115)

# [8.2.0](https://github.com/postcss/postcss-calc/compare/v8.1.0...v8.2.0) (2022-01-07)

## Features

* add types ([#155](https://github.com/postcss/postcss-calc/issues/155)) ([4c96c79](https://github.com/postcss/postcss-calc/commit/4c96c793fbc7807bb138d05b92a93bd29a2e94ac))

# [8.1.0](https://github.com/postcss/postcss-calc/compare/v8.0.0...v8.1.0) (2022-01-03)

## Features

- avoid fatal error ([#137](https://github.com/postcss/postcss-calc/issues/137)) ([125be6a](https://github.com/postcss/postcss-calc/commit/125be6ad1b1899ecd72d9a70dfe1b0690d4214b2))

# 8.0.0

- Breaking: Updated PostCSS from v7.x to v8.x ([#125](https://github.com/postcss/postcss-calc/pull/125))

# 7.0.5

- Fixed: reduction

# 7.0.4

- Fixed: strips away important factors from multiplications in calc() ([#107](https://github.com/postcss/postcss-calc/issues/107))

# 7.0.3

- Fixed: substracted css-variable from zero ([#111](https://github.com/postcss/postcss-calc/issues/111))

# 7.0.2

- Fixed: incorrect reduction of subtraction from zero ([#88](https://github.com/postcss/postcss-calc/issues/88))
- Fixed: doesn't remove calc for single function
- Fixed: relax parser on unknown units ([#76](https://github.com/postcss/postcss-calc/issues/76))
- Fixed: handle numbers with exponen composed ([#83](https://github.com/postcss/postcss-calc/pull/83))
- Fixed: handle plus sign before value ([#79](https://github.com/postcss/postcss-calc/pull/79))
- Fixed: better handle precision for nested calc ([#75](https://github.com/postcss/postcss-calc/pull/75))
- Fixed: properly handle nested add and sub expression inside sub expression ([#64](https://github.com/postcss/postcss-calc/issues/64))
- Fixed: handle uppercase units and functions ([#71](https://github.com/postcss/postcss-calc/pull/71))
- Fixed: do not break `calc` with single var ([cssnano/cssnano#725](https://github.com/cssnano/cssnano/issues/725))
- Updated: `postcss` to 7.0.27 (patch)
- Updated: `postcss-selector-parser` to 6.0.2
- Updated: `postcss-value-parser` to 4.0.2

# 7.0.1

- Updated: `postcss` to 7.0.2 (patch)
- Updated: `postcss-selector-parser` to 5.0.0-rc.4 (patch)
- Updated: `postcss-value-parser` to 3.3.1 (patch)

# 7.0.0

- Changed: Updated postcss-selector-parser to version 5.0.0-rc.3
- Changed: Dropped reduce-css-calc as a dependency
- Fixed: Support constant() and env() ([#42](https://github.com/postcss/postcss-calc/issues/42), [#48](https://github.com/postcss/postcss-calc/issues/48))
- Fixed: Support custom properties with "calc" in its name ([#50](https://github.com/postcss/postcss-calc/issues/50))
- Fixed: Remove unnecessary whitespace around `*` and `/` ([cssnano#625](https://github.com/cssnano/cssnano/issues/625))
- Fixed: Arithmetic bugs around subtraction ([#49](https://github.com/postcss/postcss-calc/issues/49))
- Fixed: Handling of nested calc statements ([reduce-css-calc#49](https://github.com/MoOx/reduce-css-calc/issues/49))
- Fixed: Bugs regarding complex calculations ([reduce-cs-calc#45](https://github.com/MoOx/reduce-css-calc/issues/45))
- Fixed: `100%` incorrectly being transformed to `1` ([reduce-css-calc#44](https://github.com/MoOx/reduce-css-calc/issues/44))
- Added: support for case-insensitive calc statements

# 6.0.2 - 2018-09-25

- Fixed: use PostCSS 7 (thanks to @douglasduteil)

# 6.0.1 - 2017-10-10

- Fixed: throwing error for attribute selectors without a value

# 6.0.0 - 2017-05-08

- Breaking: Updated PostCSS from v5.x to v6.x, and reduce-css-calc from v1.x
  to v2.x (thanks to @andyjansson).

# 5.3.1 - 2016-08-22

- Fixed: avoid security issue related to ``reduce-css-calc@< 1.2.4``.

# 5.3.0 - 2016-07-11

- Added: support for selector transformation via `selectors` option.
  ([#29](https://github.com/postcss/postcss-calc/pull/29) - @uniquegestaltung)

# 5.2.1 - 2016-04-10

- Fixed: support for multiline value
  ([#27](https://github.com/postcss/postcss-calc/pull/27))

# 5.2.0 - 2016-01-08

- Added: "mediaQueries" option for `@media` support
([#22](https://github.com/postcss/postcss-calc/pull/22))

# 5.1.0 - 2016-01-07

- Added: "warnWhenCannotResolve" option to warn when calc() are not reduced to a single value
([#20](https://github.com/postcss/postcss-calc/pull/20))

# 5.0.0 - 2015-08-25

- Removed: compatibility with postcss v4.x
- Added: compatibility with postcss v5.x

# 4.1.0 - 2015-04-09

- Added: compatibility with postcss v4.1.x ([#12](https://github.com/postcss/postcss-calc/pull/12))

# 4.0.1 - 2015-04-09

- Fixed: `preserve` option does not create duplicated values ([#7](https://github.com/postcss/postcss-calc/issues/7))

# 4.0.0 - 2015-01-26

- Added: compatibility with postcss v4.x
- Changed: partial compatiblity with postcss v3.x (stack traces have lost filename)

# 3.0.0 - 2014-11-24

- Added: GNU like exceptions ([#4](https://github.com/postcss/postcss-calc/issues/4))
- Added: `precision` option ([#5](https://github.com/postcss/postcss-calc/issues/5))
- Added: `preserve` option ([#6](https://github.com/postcss/postcss-calc/issues/6))

# 2.1.0 - 2014-10-15

- Added: source of the error (gnu like message) (fix [#3](https://github.com/postcss/postcss-calc/issues/3))

# 2.0.1 - 2014-08-10

- Fixed: correctly ignore unrecognized values (fix [#2](https://github.com/postcss/postcss-calc/issues/2))

# 2.0.0 - 2014-08-06

- Changed: Plugin now return a function to have a consistent api. ([ref 1](https://github.com/ianstormtaylor/rework-color-function/issues/6), [ref 2](https://twitter.com/jongleberry/status/496552790416576513))

# 1.0.0 - 2014-08-04

✨ First release based on [rework-calc](https://github.com/reworkcss/rework-calc) v1.1.0 (code mainly exported to [`reduce-css-calc`](https://github.com/MoOx/reduce-css-calc))
