// Read a number out of serialized CSS such as `calc(1.5)` or `-2`.
export const scalarText = (text) =>
  text.startsWith('calc(') && text.endsWith(')')
    ? text.slice('calc('.length, -1)
    : text;
export const numeric = (text) => Number.parseFloat(scalarText(text));
