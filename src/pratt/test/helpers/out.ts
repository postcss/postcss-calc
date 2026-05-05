// End-to-end pipeline helper: tokenize → parse → simplify → serialize.

import { tokenize } from '../../src/core/tokenizer.ts';
import { parse } from '../../src/core/parser.ts';
import { simplify } from '../../src/core/simplify.ts';
import { serialize, type SerializeOptions } from '../../src/core/serialize.ts';

export const out = (input: string, opts?: SerializeOptions): string =>
  serialize(simplify(parse(tokenize(input))), opts);
