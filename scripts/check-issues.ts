// Run each open issue's test case through the pratt pipeline and report
// whether v3 resolves the v10-era complaint. See gh issue list --repo
// postcss/postcss-calc --state open.

import postcss from 'postcss';
import plugin from '../src/pratt/src/plugin/plugin.ts';

interface Case {
  issue: number;
  title: string;
  category: 'parse-error' | 'wrong-output' | 'feature' | 'meta';
  declaration: string;
  expectation: string;
}

const cases: Case[] = [
  {
    issue: 238,
    title: 'calc(100vh - calc(100vh - 100%)) becomes 100%',
    category: 'wrong-output',
    declaration: 'height: calc(100vh - calc(100vh - 100%))',
    expectation: 'should NOT collapse to 100% (vh and % are different bases)',
  },
  {
    issue: 236,
    title: 'lvh/lvw trigger UNKNOWN_DIMENSION',
    category: 'parse-error',
    declaration: 'height: calc(5.08lvh * var(--something))',
    expectation: 'no warning; fold or preserve',
  },
  {
    issue: 233,
    title: 'Lexical error on relative color calc(l * 0.7)',
    category: 'parse-error',
    declaration: '--red-950: oklch(from var(--red-base) calc(l * 0.7) c h)',
    expectation: 'no parse error on the inner calc()',
  },
  {
    issue: 222,
    title: 'Reduce pure pow() functions',
    category: 'feature',
    declaration: 'font-size: calc(1rem * pow(1.618, 3))',
    expectation: 'should fold pow() and absorb into the rem coefficient',
  },
  {
    issue: 216,
    title: 'CSS Color level 5 relative color functions',
    category: 'parse-error',
    declaration: 'color: color(from blue oklab calc(l * 0.9) a b / alpha)',
    expectation: 'no parse error on the inner calc()',
  },
  {
    issue: 190,
    title: 'Lexical error on max(var(1, var(2,3)), …)',
    category: 'parse-error',
    declaration: 'width: calc(max(var(1, var(2,3)), var(4, var(5,6))) * 1)',
    expectation: 'no parse error',
  },
  {
    issue: 189,
    title: 'Support for min()/max() simplification (inside calc)',
    category: 'feature',
    declaration: 'width: calc(min(360px, 100% - 24px - 24px))',
    expectation: 'should simplify the inner sum to min(360px, 100% - 48px)',
  },
  {
    issue: 189,
    title: 'Support for min()/max() simplification (bare, no calc)',
    category: 'feature',
    declaration: 'width: min(360px, 100% - 24px - 24px)',
    expectation: 'should simplify to min(360px, 100% - 48px)',
  },
  {
    issue: 144,
    title: 'Do not calculate the percentage in calc()',
    category: 'wrong-output',
    declaration: 'width: calc(100% / 3)',
    expectation: 'percentages are property-context-resolved; should not yield e.g. 33.33333% for non-divisible cases',
  },
  {
    issue: 142,
    title: 'ParserError with calc(var(--x) * -1)',
    category: 'parse-error',
    declaration: 'margin: 0 calc(var(--my-var) * -1) 0 0',
    expectation: 'no parse error',
  },
  {
    issue: 132,
    title: 'Floating number with unknown unit can\'t be parsed',
    category: 'parse-error',
    declaration: 'height: calc(120rpx - 41.7rpx)',
    expectation: 'no parse error (rpx is an unknown unit but should be preserved)',
  },
  {
    issue: 130,
    title: 'error compiling 1 * clamp(1, ((1*1)*1), 1)',
    category: 'parse-error',
    declaration: '--test: calc(1 * clamp(1, ((1 * 1) * 1), 1))',
    expectation: 'no parse error; fold to 1',
  },
  {
    issue: 117,
    title: 'broken example calc(min(max(var(--foo), 0), 100))',
    category: 'parse-error',
    declaration: 'width: calc(min(max(var(--foo), 0), 100))',
    expectation: 'no parse error; preserve as min(max(var(--foo), 0), 100)',
  },
  {
    issue: 104,
    title: 'calc() breaks with 3+ variable fallbacks',
    category: 'parse-error',
    declaration:
      'width: calc(var(--width-lg, var(--width-md, var(--width-sm, 0))) + var(--offset-lg, var(--offset-md, var(--offset-sm, 0))))',
    expectation: 'no parse error',
  },
  {
    issue: 77,
    title: 'Parse error with var() default containing nested calc',
    category: 'parse-error',
    declaration: 'margin-right: calc(var(--b, calc(var(--c) * 1)))',
    expectation: 'no parse error',
  },
  {
    issue: 62,
    title: 'Allow rounding option (only round when exact)',
    category: 'feature',
    declaration: 'width: calc(100% / 3)',
    expectation: 'feature request: only emit rounded form when it equals the exact value',
  },
];

const META_NOTES: Record<number, string> = {
  198: 'Meta: hand-written Pratt parser is exactly what v3 ships.',
  67:  'Meta: browserlist integration is out of scope (cssnano territory).',
};

interface Run {
  ok: boolean;
  output: string;
  warnings: string[];
}

async function run(declaration: string): Promise<Run> {
  const css = `.x { ${declaration}; }`;
  try {
    const result = await postcss([plugin()]).process(css, { from: undefined });
    return {
      ok: true,
      output: result.css.replace(/^\.x \{ ([\s\S]*?); \}$/, '$1'),
      warnings: result.warnings().map((w) => w.text),
    };
  } catch (err) {
    return {
      ok: false,
      output: err instanceof Error ? err.message : String(err),
      warnings: [],
    };
  }
}

async function main(): Promise<void> {
  console.log(`Running ${cases.length} test cases against pratt v3.\n`);

  let resolved = 0;
  let unresolved = 0;
  const skipped: number[] = [];

  for (const c of cases) {
    const r = await run(c.declaration);
    const tag =
      !r.ok                                  ? 'THROWS'
      : r.warnings.length > 0                ? 'WARNS '
                                             : 'OK    ';
    console.log(`#${c.issue.toString().padStart(3)} [${tag}] ${c.title}`);
    console.log(`        in:  ${c.declaration}`);
    console.log(`        out: ${r.output}`);
    if (r.warnings.length > 0) {
      console.log(`        warns: ${r.warnings.join(' | ')}`);
    }
    console.log(`        expected: ${c.expectation}`);
    if (tag === 'OK    ') resolved++;
    else unresolved++;
    console.log();
  }

  for (const [n, note] of Object.entries(META_NOTES)) {
    console.log(`#${n.padStart(3)} [META  ] ${note}`);
    skipped.push(Number(n));
  }

  console.log();
  console.log(`Summary: ${resolved} OK, ${unresolved} throws/warns, ${skipped.length} meta`);
}

main();
