// Spec: https://www.w3.org/TR/css-values-4/#serialize-a-calculation-tree
// Precision rounding, degenerate keyword serialization (NaN, Infinity), and
// scalar number/dimension formatting.

/**
 * @typedef {import('../node.js').Node} Node
 * @typedef {import('../node.js').Num} Num
 * @typedef {import('../node.js').Dim} Dim
 * @typedef {object} SerializeSession
 * @property {import('./sink.js').Sink} out
 * @property {number | false} precision
 * @property {'standard' | 'unwrap-all'} scalarPolicy
 */

const NOISE_FLOOR = 1e-12;

/**
 * Divide a decimal digit string by 10^k, rounding half away from zero, and
 * return the resulting integer digit string. `digits` has no leading zeros.
 * @param {string} digits
 * @param {number} k
 * @return {string}
 */
function divideByPowerOfTen(digits, k) {
  // 0x30/0x35/0x39 are the char codes of '0'/'5'/'9'.
  if (digits.length <= k) {
    return digits.length === k && digits.charCodeAt(0) >= 0x35 ? '1' : '0';
  }
  const cut = digits.length - k;
  if (digits.charCodeAt(cut) < 0x35) return digits.slice(0, cut);
  // Round up and propagate the carry through trailing nines.
  let index = cut - 1;
  while (index >= 0 && digits.charCodeAt(index) === 0x39) index--;
  if (index < 0) return `1${'0'.repeat(cut)}`;
  return `${digits.slice(0, index)}${String.fromCharCode(
    digits.charCodeAt(index) + 1
  )}${'0'.repeat(cut - index - 1)}`;
}

/**
 * Round the shortest decimal representation of a non-negative double to `p`
 * fractional digits, half away from zero.
 *
 * `Number(text + 'e' + p)` reads the exact intended decimal (so `1.005` at
 * precision 2 becomes `1.01`), but it is only exact while the shifted value
 * fits in `Number.MAX_SAFE_INTEGER`; beyond that the intermediate double
 * rounds and can move the rounding boundary (e.g. `312834450754803.44` at
 * precision 1 or 6 drifted to `312834450754803.5`). Round the decimal digits
 * directly instead.
 *
 * @param {number} abs
 * @param {number} p
 * @return {number}
 */
function roundDecimal(abs, p) {
  const text = String(abs);
  const eIdx = text.indexOf('e');
  const mantissa = eIdx === -1 ? text : text.slice(0, eIdx);
  let exponent = eIdx === -1 ? 0 : Number(text.slice(eIdx + 1));
  const dot = mantissa.indexOf('.');
  let digits = mantissa;
  if (dot !== -1) {
    digits = mantissa.slice(0, dot) + mantissa.slice(dot + 1);
    exponent -= mantissa.length - dot - 1;
  }

  // value = digits * 10^exponent, so the shortest decimal has -exponent
  // fractional digits when it is smaller than 1.
  if (exponent >= -p) return abs;

  let start = 0;
  while (start < digits.length - 1 && digits.charCodeAt(start) === 0x30)
    start++;
  const rounded = divideByPowerOfTen(digits.slice(start), -(exponent + p));
  return Number(`${rounded}e-${p}`);
}

/**
 * @param {number} v
 * @param {number | false} prec
 * @return {number}
 */
function round(v, prec) {
  if (prec === false || !Number.isFinite(v)) return v;
  if (Object.is(v, -0) || v === 0) return v;
  const abs = Math.abs(v);
  // Numbers >= MAX_SAFE_INTEGER (2^53 - 1) cannot represent fractional values, and
  // integers already have 0 fractional places. Bypassing them avoids float drift.
  if (abs >= Number.MAX_SAFE_INTEGER || Number.isInteger(v)) return v;

  // Clamp precision to [0, 100] integer to prevent NaN from fractional precisions
  // or exponent overflows into Infinity/NaN (e.g. exponent + prec > 308).
  const p = Math.min(100, Math.max(0, Math.trunc(prec)));
  const sign = v < 0 ? -1 : 1;
  // Values below 1 keep `p` significant digits (at least one) rather than `p`
  // decimals, so small magnitudes lose precision evenly. The exponent comes
  // from the decimal text, not log10, so powers of ten cannot land off by one.
  if (abs < 1) {
    const exponent = Number(abs.toExponential().split('e')[1]);
    const rounded = roundDecimal(abs, Math.max(p, 1) - 1 - exponent);
    // Snap true floating-point dust (<= 1e-12) to zero, unless the precision
    // is high enough to represent it as a fractional value.
    if (abs <= NOISE_FLOOR && roundDecimal(abs, p) === 0) {
      return sign === -1 ? -0 : 0;
    }
    return sign * rounded;
  }
  return sign * roundDecimal(abs, p);
}

// §10.13 / §10.7.2: Infinity/NaN serialize as canonical keywords.
/** @param {number} v @return {boolean} */
function isDegenerate(v) {
  return !Number.isFinite(v) || Number.isNaN(v);
}

/** @param {number} v @return {string} */
function degenerateKeyword(v) {
  if (Number.isNaN(v)) return 'NaN';
  return v > 0 ? 'infinity' : '-infinity';
}

/** @param {number} v @return {string} */
function serializeNumber(v) {
  if (Object.is(v, -0)) return '0';
  const text = String(v);
  if (text.startsWith('0.')) return text.slice(1);
  if (text.startsWith('-0.')) return `-${text.slice(2)}`;
  return text;
}

/**
 * @param {import('../node.js').Num | import('../node.js').Dim} node
 * @param {SerializeSession['out']} out
 * @param {number} value
 * @return {void}
 */
function emitRoundedScalar(node, out, value) {
  const text = serializeNumber(value);
  if (node.type === 'Dim') out.dimension(text, node.rawUnit ?? node.unit);
  else out.number(text);
}

/**
 * A non-finite value as its keyword. A dimension keeps its unit as `* 1<unit>`
 * so the keyword stays a valid calculation. `wrapper` names the function that
 * wraps the keyword, or is omitted to emit the bare keyword.
 *
 * @param {SerializeSession['out']} out
 * @param {number} value
 * @param {import('../node.js').Num | import('../node.js').Dim} node
 * @param {string} [wrapper]
 * @return {void}
 */
function emitDegenerate(out, value, node, wrapper) {
  if (wrapper !== undefined) out.fn(wrapper);
  out.ident(degenerateKeyword(value));
  if (node.type === 'Dim') {
    out.op('*');
    out.dimension('1', node.rawUnit ?? node.unit);
  }
  if (wrapper !== undefined) out.close();
}

/**
 * @param {import('../node.js').Num | import('../node.js').Dim} node
 * @param {SerializeSession} session
 * @param {number} [value]
 * @param {boolean} [bare] emit negative zero without its calc() wrapper
 * @return {void}
 */
function emitScalar(node, session, value, bare = false) {
  const out = session.out;
  const effective = value ?? node.value;
  if (Object.is(effective, -0)) {
    if (bare) emitBareSignedZero(out, node);
    else emitSignedZero(out, node);
  } else if (isDegenerate(effective)) {
    // A bare number keyword is valid in a sum or product, so only a dimension is wrapped.
    emitDegenerate(
      out,
      effective,
      node,
      node.type === 'Dim' ? 'calc' : undefined
    );
  } else {
    emitRoundedScalar(node, out, round(effective, session.precision));
  }
}

/**
 * @param {SerializeSession['out']} out
 * @param {import('../node.js').Num | import('../node.js').Dim} node
 * @return {void}
 */
function emitSignedZero(out, node) {
  out.fn('calc');
  emitBareSignedZero(out, node);
  out.close();
}

/**
 * Negative zero as an unwrapped product, valid only where a `<calc-product>`
 * may appear without changing how the surrounding expression parses.
 * @param {SerializeSession['out']} out
 * @param {import('../node.js').Num | import('../node.js').Dim} node
 * @return {void}
 */
function emitBareSignedZero(out, node) {
  out.minus();
  out.number('1');
  out.op('*');
  if (node.type === 'Dim') out.dimension('0', node.rawUnit ?? node.unit);
  else out.number('0');
}

/** @param {Node} node @return {node is import('../node.js').Num | import('../node.js').Dim} */
function isScalar(node) {
  return node.type === 'Num' || node.type === 'Dim';
}

/** @param {Node} node @return {node is import('../node.js').Num | import('../node.js').Dim} */
function isSignedZero(node) {
  return isScalar(node) ? Object.is(node.value, -0) : false;
}

export {
  NOISE_FLOOR,
  divideByPowerOfTen,
  roundDecimal,
  round,
  isDegenerate,
  degenerateKeyword,
  serializeNumber,
  emitDegenerate,
  emitRoundedScalar,
  emitScalar,
  emitSignedZero,
  emitBareSignedZero,
  isScalar,
  isSignedZero,
};
