// A replacement that ends beside a name character is separated from it. Name
// characters are ASCII letters, digits, `_`, `-`, `.`, and every code point from
// U+0080 up, so an emoji (a surrogate pair) counts as one.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import reduceCalc from 'postcss-calc/reduce';

const unwrap = { unwrapSingleValue: true };

describe('a replacement is separated from a neighbouring character before it', () => {
  const cases = [
    ['a dot that would make a decimal', '.calc(1px + 1px)', '. 2px'],
    ['a dot after a number', '1.calc(1px + 1px)', '1. 2px'],
    ['a letter with no space', 'a.calc(1px + 1px)', 'a. 2px'],
    ['a quote, which needs no separator', '"a"calc(1px + 1px)', '"a"2px'],
  ];
  for (const [name, value, expected] of cases) {
    test(name, () => {
      assert.equal(reduceCalc(value, unwrap), expected);
    });
  }
});

describe('a replacement is separated from a neighbouring name character', () => {
  const cases = [
    ['an ASCII underscore', 'foo(calc(1px + 1px)_)', 'foo(2px _)'],
    ['an ASCII hyphen', 'foo(calc(1px + 1px)-)', 'foo(2px -)'],
    ['a Latin-1 letter', 'foo(calc(1px + 1px)é)', 'foo(2px é)'],
    ['an emoji', 'foo(calc(1px + 1px)\u{1F600})', 'foo(2px \u{1F600})'],
    ['a space', 'foo(calc(1px + 1px) \u{1F600})', 'foo(2px \u{1F600})'],
  ];
  for (const [name, value, expected] of cases) {
    test(name, () => {
      assert.equal(reduceCalc(value, unwrap), expected);
    });
  }
});
