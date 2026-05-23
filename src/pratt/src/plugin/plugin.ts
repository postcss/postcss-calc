// PostCSS adapter. Walks declaration values (and optionally @rule params
// and selectors), feeds calc() bodies through tokenize → parse → simplify
// → serialize, and writes the result back. Drop-in compatible with the
// v10 public option surface.

import valueParser from 'postcss-value-parser';
import type { PluginCreator, Result, ChildNode } from 'postcss';

import { tokenize } from '../core/tokenizer.ts';
import { parse } from '../core/parser.ts';
import { simplify } from '../core/simplify.ts';
import { serialize } from '../core/serialize.ts';

const MATCH_CALC = /^(?:-(?:moz|webkit)-)?calc$/i;

// Bare math-function calls (no calc() wrapper) — fed to the same pipeline.
// Mirrors the dispatch in simplify/call.ts.
const MATH_FUNCTIONS = new Set([
  'min', 'max', 'clamp',
  'abs', 'sign',
  'mod', 'rem', 'round',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'pow', 'sqrt', 'hypot', 'log', 'exp',
]);

export interface PluginOptions {
  precision?: number | false;
  preserve?: boolean;
  warnWhenCannotResolve?: boolean;
  mediaQueries?: boolean;
  selectors?: boolean;
  /** §10.1 requires whitespace around binary `+`/`-`. Default true (strict).
   *  Set false to accept jison-style lenient input like `2px+3px`. */
  strictWhitespace?: boolean;
  /** Sort each Sum / Product back into outer-expression input order rather
   *  than the simplifier's canonical (numeric-first) shape. Default false. */
  preserveOrder?: boolean;
  /** Drop `+ 0px` identities from sums when other terms carry type info.
   *  Default false (WPT calc-serialization-002 requires preservation). */
  dropZeroIdentities?: boolean;
  /** Invoked when parse/simplify throws. Replaces the default `result.warn`. */
  onParseError?: (error: Error, input: string) => void;
}

type ResolvedOptions = Required<Omit<PluginOptions, 'onParseError'>> &
  Pick<PluginOptions, 'onParseError'>;

function transformValue(
  value: string,
  options: ResolvedOptions,
  result: Result,
  item: ChildNode,
  /** Recurse into quoted strings — needed for selectors where calc()
   *  hides inside attribute values like `[data-size="calc(3*3)"]`.
   *  Off by default: a declaration value like `content: "calc(...)"`
   *  is a literal display string, not arithmetic. */
  descendIntoStrings = false
): string {
  // postcss-value-parser's walk() returns the parser for chaining and has
  // a custom toString(). ESLint can't see the custom toString.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return valueParser(value)
    .walk((node) => {
      if (node.type === 'string' && descendIntoStrings) {
        node.value = transformValue(node.value, options, result, item, true);
        return;
      }
      if (node.type !== 'function') return;
      const isCalc = MATCH_CALC.test(node.value);
      const isMath = !isCalc && MATH_FUNCTIONS.has(node.value.toLowerCase());
      if (!isCalc && !isMath) return;

      // calc(): feed the body. Bare math: feed the whole call.
      const inner = valueParser.stringify(node.nodes);
      const contents = isCalc ? inner : `${node.value}(${inner})`;
      try {
        const simplified = simplify(
          parse(
            tokenize(contents, { lenientWhitespace: !options.strictWhitespace })
          ),
          {
            preserveOrder: options.preserveOrder,
            dropZeroIdentities: options.dropZeroIdentities,
          }
        );
        const str = serialize(simplified, {
          precision: options.precision,
          calcName: isCalc ? node.value : 'calc', // preserve vendor prefix on calc()
        });

        if (options.warnWhenCannotResolve && str.startsWith(`${node.value}(`)) {
          result.warn('Could not reduce expression: ' + value, {
            plugin: 'postcss-calc',
            node: item,
          });
        }

        (node as { type: string }).type = 'word';
        node.value = str;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Error');
        if (options.onParseError) {
          options.onParseError(err, contents);
        } else {
          result.warn(err.message, { node: item });
        }
      }
      return false;
    })
    .toString();
}

const pluginCreator: PluginCreator<PluginOptions> = (opts) => {
  const options: ResolvedOptions = {
    precision: 5,
    preserve: false,
    warnWhenCannotResolve: false,
    mediaQueries: false,
    selectors: false,
    strictWhitespace: true,
    preserveOrder: false,
    dropZeroIdentities: false,
    ...opts,
  };

  return {
    postcssPlugin: 'postcss-calc',
    OnceExit(css, { result }) {
      css.walk((node) => {
        if (node.type === 'decl') {
          const next = transformValue(node.value, options, result, node);
          if (options.preserve && node.value !== next) {
            const clone = node.clone();
            clone.value = next;
            node.parent!.insertBefore(node, clone);
          } else {
            node.value = next;
          }
        }
        if (node.type === 'atrule' && options.mediaQueries) {
          const next = transformValue(node.params, options, result, node);
          if (options.preserve && node.params !== next) {
            const clone = node.clone();
            clone.params = next;
            node.parent!.insertBefore(node, clone);
          } else {
            node.params = next;
          }
        }
        if (node.type === 'rule' && options.selectors) {
          // Selectors carry calc() in two places: pseudo-class arguments
          // (`:nth-child(...)` — caught by the function walk) and quoted
          // attribute values (`[data-size="calc(3*3)"]` — needs string
          // recursion).
          const next = transformValue(node.selector, options, result, node, true);
          if (options.preserve && node.selector !== next) {
            const clone = node.clone();
            clone.selector = next;
            node.parent!.insertBefore(node, clone);
          } else {
            node.selector = next;
          }
        }
      });
    },
  };
};

pluginCreator.postcss = true;

export default pluginCreator;
// CommonJS interop: PostCSS plugin convention sets both module.exports
// and module.exports.default. The `.default` write trips no-unsafe-*.
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
module.exports = pluginCreator;
module.exports.default = pluginCreator;
/* eslint-enable @typescript-eslint/no-unsafe-member-access */
