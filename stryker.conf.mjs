// Stryker mutation testing config.
//
// Mutates the core pipeline (simplify + serialize + node constructors) and
// reports the kill rate. A surviving mutant means the test suite would
// accept a wrong implementation — i.e. a real coverage hole.
//
// We use the `command` runner since our test harness is `node --test` via
// tsx. Each mutant runs the whole pratt suite; the suite is fast enough
// (<400ms) that this is practical.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'command',
  commandRunner: {
    command: 'node --test',
  },
  mutate: [
    'src/lib/simplify.js',
    'src/lib/serialize.js',
    'src/lib/node.js',
  ],
  ignorePatterns: ['node_modules', 'types'],
  // Mutation score targets — anything below 70 fails CI.
  thresholds: { high: 85, low: 70, break: 70 },
  reporters: ['clear-text', 'html', 'progress', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  concurrency: 4,
  timeoutMS: 30000,
  // Mutant categories worth including / skipping:
  disableTypeChecks: true,
};
