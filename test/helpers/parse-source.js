// Parse CSS source over its full token range with the production parser.
import { tokenize } from '@csstools/css-tokenizer';
import { indexBlocks } from '../../src/lib/block-index.js';
import { parse } from '../../src/lib/parser.js';

import { sexpr } from './sexpr.js';

export const parseSource = (css) => {
  const tokens = tokenize({ css });
  return parse(tokens, 0, tokens.length, indexBlocks(tokens));
};

export const parseSexpr = (css) => sexpr(parseSource(css));
