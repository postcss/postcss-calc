// Four logarithmically spaced sizes with uniform doubling steps (2x)
// keep the scaling claims (slope and doubling growth) sound and well-powered
// while holding the default 20-block run to under five minutes.
export const SIZES = [2_000, 4_000, 8_000, 16_000];
export const DEPTHS = [16, 32, 64, 128, 256, 512];

// 16ms batch targets provide ample separation above the timer resolution floor
// while keeping worker durations concise.
export const PARSER_TARGET_BATCH_MS = 16;
export const PARSER_WARMUP_MINIMUM = 4;
export const PARSER_WARMUP_MAXIMUM = 8;
export const PARSER_MEASURED_BATCHES = 5;

function arithmetic(kind, size) {
  if (kind === 'additive') return Array(size).fill('1').join(' + ');
  if (kind === 'multiplicative') return Array(size).fill('2').join(' * ');
  const operators = [' + ', ' * ', ' - ', ' / '];
  const parts = ['1'];
  for (let i = 1; i < size; i++)
    parts.push(operators[(i - 1) % operators.length], String((i % 7) + 1));
  return parts.join('');
}

function nestedFallback(depth) {
  let value = 'calc(1px + 2px)';
  for (let i = depth; i >= 1; i--) value = `calc(var(--x${i}, ${value}))`;
  return value;
}

export function parserWorkloads(benchmark) {
  const result = [];
  if (benchmark === 'arithmetic-chains') {
    for (const shape of [
      'additive',
      'multiplicative',
      'alternating-precedence',
    ])
      for (const mode of ['cold-index', 'hot-shared-index'])
        for (const size of SIZES)
          result.push({
            key: `${shape}:${mode}:${size}`,
            shape,
            mode,
            size,
            source: arithmetic(shape, size),
          });
  } else if (benchmark === 'nested-fallbacks') {
    for (const mode of ['cold-index', 'hot-shared-index'])
      for (const depth of DEPTHS)
        result.push({
          key: `nested-fallbacks:${mode}:${depth}`,
          shape: 'nested-fallbacks',
          mode,
          size: depth,
          source: nestedFallback(depth),
        });
  } else throw new Error(`unsupported benchmark: ${benchmark}`);
  return result;
}

export function endpointKey(workload) {
  return workload.key;
}
