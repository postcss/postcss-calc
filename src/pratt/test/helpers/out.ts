// End-to-end pipeline helper: tokenize → parse → simplify → serialize.

import { tokenize } from '../../../lib/tokenizer.js';
import { parse } from '../../../lib/parser.js';
import { simplify } from '../../../lib/simplify.js';
import { serialize, type SerializeOptions } from '../../../lib/serialize.js';

export const out = (input: string, opts?: SerializeOptions): string =>
  serialize(simplify(parse(tokenize(input))), opts);
