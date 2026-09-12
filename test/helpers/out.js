// End-to-end pipeline helper: tokenize → parse → simplify → serialize.
import { tokenize } from '../../src/lib/tokenizer.js';
import { parse } from '../../src/lib/parser.js';
import { simplify } from '../../src/lib/simplify.js';
import { serialize } from '../../src/lib/serialize.js';
export const out = (input, opts) =>
  serialize(simplify(parse(tokenize(input))), opts);
