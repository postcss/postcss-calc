import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const registerHooksPath = fileURLToPath(
  new URL('./register-hooks.mjs', import.meta.url)
);

// Node 24 discovers every module below `test/` when invoked as `node --test`.
// The mutation driver is a standalone script, so skip it when discovery runs
// it without the mutation environment supplied by the driver itself.
if (process.env.NODE_TEST_CONTEXT) {
  // Intentionally empty: this module is only a direct test script.
} else {
  const mutations = [
    {
      name: 'drops parser-rejected inputs',
      file: 'test/helpers/corpus-selection.mjs',
      find: 'parserRejected: parserRejected.sort(sortByHash),',
      replace: 'parserRejected: [],',
    },
    {
      name: 'stops comparing parser-rejected inputs with css-calc',
      file: 'test/conformance/corpus.test.mjs',
      find: '(input) => theirOut(input) !== null',
      replace: '(input) => false',
    },
  ];

  for (const mutation of mutations) {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        registerHooksPath,
        '--test',
        'test/conformance/corpus.test.mjs',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          POSTCSS_CALC_MUTATION: JSON.stringify(mutation),
        },
      }
    );
    if (result.status === 0) {
      throw new Error(`Surviving mutation: ${mutation.name}`);
    }
    process.stdout.write(`killed: ${mutation.name}\n`);
  }
}
