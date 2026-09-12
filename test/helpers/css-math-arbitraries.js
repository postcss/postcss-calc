import fc from 'fast-check';
import { tokenize } from '../../src/lib/tokenizer.js';
import { parse } from '../../src/lib/parser.js';
// CSS Values & Units Level 4 math grammar, bounded to the functions exposed
// by isSupportedMathFunction in this package.  This intentionally generates
// source text, then sends it through the production tokenizer/parser: parser
// grouping markers are observable behavior and must not be manufactured with
// raw AST object literals in a test generator.
const CSS_MATH_UNITS = ['px', 'em', 's', 'deg', '%'];
const cssNumberArb = fc.integer({ min: -20, max: 20 }).map(String);
const cssDimensionArb = fc
  .tuple(fc.integer({ min: -20, max: 20 }), fc.constantFrom(...CSS_MATH_UNITS))
  .map(([value, unit]) => `${value}${unit}`);
const opaqueLeafArb = fc.constantFrom(
  'var(--a)',
  'var(--b, 2px)',
  'var(--c, calc(1px + 2px))',
  'unknown-math(var(--d))'
);

function checkedSource(source) {
  // Keep the generator tied to the production grammar. Throwing here makes a
  // generator update fail immediately instead of silently reducing coverage.
  parse(tokenize(source));
  return source;
}

const cssMathInnerArb = fc.memo((depth) => {
  const leaf = fc.oneof(cssNumberArb, cssDimensionArb, opaqueLeafArb);
  if (depth <= 1) return leaf;
  const smaller = cssMathInnerArb(depth - 1);
  const binary = fc.oneof(
    fc.tuple(smaller, smaller).map(([a, b]) => `${a} + ${b}`),
    fc.tuple(smaller, smaller).map(([a, b]) => `${a} - (${b})`),
    fc.tuple(smaller, smaller).map(([a, b]) => `${a} * ${b}`),
    fc.tuple(smaller, smaller).map(([a, b]) => `(${a} + ${b})`)
  );
  const calls = fc.oneof(
    fc
      .tuple(fc.constantFrom('min', 'max', 'hypot'), smaller, smaller)
      .map(([name, a, b]) => `${name}(${a}, ${b})`),
    fc
      .tuple(
        fc.constantFrom('abs', 'sign', 'sin', 'cos', 'tan', 'sqrt', 'exp'),
        smaller
      )
      .map(([name, a]) => `${name}(${a})`),
    fc
      .tuple(fc.constantFrom('pow', 'atan2', 'mod', 'rem'), smaller, smaller)
      .map(([name, a, b]) => `${name}(${a}, ${b})`),
    fc
      .tuple(smaller, smaller, smaller)
      .map(([a, b, c]) => `clamp(${a}, ${b}, ${c})`),
    fc.tuple(smaller, smaller).map(([a, b]) => `round(${a}, ${b})`),
    fc.tuple(smaller).map(([a]) => `calc(${a})`)
  );
  return fc.oneof({ weight: 2, arbitrary: leaf }, binary, calls);
});

/** Source-level, parser-checked CSS math expressions for grammar properties. */
export const cssMathSourceArb = cssMathInnerArb(3).map((inner) =>
  checkedSource(`calc(${inner})`)
);

/**
 * Opaque grouped sums with exact expected output.  Negative signs must remain
 * outside the group; positive groups can flatten because no sign distributes.
 */
export const opaqueGroupedCalcArb = fc
  .tuple(fc.constantFrom('--a', '--x'), fc.constantFrom('--b', '--y'))
  .chain(([a, b]) =>
    fc.constantFrom(
      {
        input: `calc(-(var(${a}) + var(${b})))`,
        expected: `calc(-(var(${a}) + var(${b})))`,
      },
      {
        input: `calc(var(${a}) - (var(${b}) + 10px))`,
        expected: `calc(var(${a}) - (10px + var(${b})))`,
      },
      {
        input: `calc(5px - (var(${a}, 1px) + var(${b}, calc(2px + 3px))))`,
        expected: `calc(5px - (var(${a}, 1px) + var(${b}, 5px)))`,
      },
      {
        input: `calc(var(${a}) + (var(${b}) + 10px))`,
        expected: `calc(10px + var(${a}) + var(${b}))`,
      }
    )
  )
  .map((example) => ({ ...example, input: checkedSource(example.input) }));
