export const raw = (tokens) => tokens.map((token) => token[1]).join('');

/** Apply `reduceTokens` replacements from last to first, as a caller editing in place would. */
export function applyReplacements(tokens, replacements) {
  const edited = [...tokens];
  for (const { start, end, tokens: next } of replacements.toReversed()) {
    edited.splice(start, end - start, ...next);
  }
  return edited;
}
