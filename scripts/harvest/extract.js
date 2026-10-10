// Strip /* */ comments and quoted strings (replace with spaces to keep offsets).
function sanitize(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) {
        out += ' '.repeat(src.length - i);
        break;
      }
      out += ' '.repeat(end + 2 - i);
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out += ' ';
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < src.length) {
          out += '  ';
          i += 2;
          continue;
        }
        out += ' ';
        i++;
      }
      if (i < src.length) {
        out += ' ';
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
const CALC_RE = /(?:^|[^\w-])(?:-(?:webkit|moz|ms|o)-)?calc\(/gi;
export function extractCalcs(src) {
  const sanitized = sanitize(src);
  const results = [];
  let m;
  CALC_RE.lastIndex = 0;
  while ((m = CALC_RE.exec(sanitized)) !== null) {
    const matchEnd = m.index + m[0].length;
    const openParen = matchEnd - 1;
    const before = sanitized.slice(0, openParen).toLowerCase();
    const calcStart = before.lastIndexOf('calc');
    if (calcStart === -1) continue;
    let depth = 1;
    let j = openParen + 1;
    while (j < sanitized.length && depth > 0) {
      const ch = sanitized[j];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      j++;
    }
    if (depth !== 0) continue;
    const expr = src.slice(calcStart, j);
    const flat = expr.replaceAll(/\s+/g, ' ').trim();
    if (flat.length > 2 && flat.length < 4096) results.push(flat);
    // Continue scanning after the open paren so nested calc()s also match.
    CALC_RE.lastIndex = matchEnd;
  }
  return results;
}
