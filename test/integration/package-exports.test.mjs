import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join, resolve } from 'node:path';

function run(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`
  );
}

test('packed package exposes the standalone reducer with usable types', async () => {
  // Keeping this below the project lets the unpacked package resolve this
  // checkout's already-installed runtime dependencies as an installed
  // consumer would.
  const fixture = await mkdtemp(join(process.cwd(), '.postcss-calc-package-'));
  try {
    run('pnpm', ['pack', '--pack-destination', fixture], {
      cwd: process.cwd(),
    });

    const archive = join(
      fixture,
      (await readdir(fixture)).find((name) => name.endsWith('.tgz'))
    );
    const modules = join(fixture, 'node_modules');
    await mkdir(modules);
    run('tar', ['-xzf', archive, '-C', modules]);
    await rename(join(modules, 'package'), join(modules, 'postcss-calc'));

    const runtime = join(fixture, 'runtime.mjs');
    await writeFile(
      runtime,
      [
        "import reduceCalc from 'postcss-calc/reduce';",
        "if (reduceCalc('calc(1px + 2px)') !== '3px') throw new Error('reducer failed');",
      ].join('\n')
    );
    run(process.execPath, [runtime], { cwd: fixture });

    const types = join(fixture, 'consumer.ts');
    await writeFile(
      types,
      [
        "import reduceCalc, { type ReduceCalcOptions } from 'postcss-calc/reduce';",
        'const options: ReduceCalcOptions = { precision: false };',
        "const reduced: string = reduceCalc('calc(1px + 2px)', options);",
        'void reduced;',
      ].join('\n')
    );
    run(
      process.execPath,
      [
        resolve('node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--ignoreConfig',
        '--module',
        'nodenext',
        '--moduleResolution',
        'nodenext',
        '--target',
        'es2022',
        '--strict',
        types,
      ],
      { cwd: fixture }
    );
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});
