// End-to-end pipeline helper: tokenize → parse → simplify → serialize.
import { tokenize } from '@csstools/css-tokenizer';
import { indexBlocks } from '../../src/lib/block-index.js';
import { parse } from '../../src/lib/parser.js';
import { simplify } from '../../src/lib/simplify.js';
import { serialize } from '../../src/lib/serialize.js';
export const out = (input, opts) => {
  const tokens = tokenize({ css: input });
  return serialize(
    simplify(parse(tokens, 0, tokens.length, indexBlocks(tokens))),
    opts
  );
};
