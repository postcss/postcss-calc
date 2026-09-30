/* oxlint-disable no-bitwise */
/** @param {unknown} seed @return {number} */
export function normalizeSeed(seed) {
  if (typeof seed === 'number') {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
      throw new TypeError('seed must be an unsigned 32-bit integer');
    return seed >>> 0;
  }
  if (typeof seed === 'string' && /^\d+$/.test(seed)) {
    const value = Number(seed);
    if (Number.isSafeInteger(value) && value <= 0xffffffff) return value >>> 0;
  }
  throw new TypeError('seed must be an unsigned 32-bit integer');
}

/** @param {number} seed @return {() => number} */
export function seededRandom(seed) {
  let state = normalizeSeed(seed) || 0x9e3779b9;
  return () => {
    state = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
    state = Math.imul(state ^ (state >>> 15), 0x735a2d97);
    state ^= state >>> 15;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

/** @template T @param {readonly T[]} values @param {number} seed @return {T[]} */
export function seededShuffle(values, seed) {
  const result = [...values];
  const random = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Return a shuffled, balanced process schedule.  Values are deliberately
 * explicit (`baseline-first`/`candidate-first`) so the artifact is auditable.
 *
 * @param {number} count
 * @param {number} seed
 */
export function balancedOrder(count, seed) {
  if (!Number.isInteger(count) || count < 2 || count % 2 !== 0)
    throw new RangeError('a balanced schedule requires a positive even count');
  return seededShuffle(
    Array.from({ length: count }, (_, index) =>
      index < count / 2 ? 'baseline-first' : 'candidate-first'
    ),
    seed
  );
}

/**
 * Return a deterministic, balanced schedule for the corpus calibration order.
 * Odd counts differ by at most one; the first label receives the extra slot.
 */
export function balancedSchedule(count, first, second, seed) {
  if (!Number.isInteger(count) || count <= 0)
    throw new RangeError('schedule count must be positive');
  if (
    typeof first !== 'string' ||
    typeof second !== 'string' ||
    first === second
  )
    throw new TypeError('schedule labels must be distinct strings');
  return seededShuffle(
    Array.from({ length: count }, (_, index) =>
      index < Math.ceil(count / 2) ? first : second
    ),
    seed
  );
}

/** @param {number} count @param {number} seed @return {number[]} */
export function bootstrapIndices(count, seed) {
  if (!Number.isInteger(count) || count <= 0)
    throw new RangeError('cannot resample an empty collection');
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => Math.floor(random() * count));
}
