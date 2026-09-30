import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpus, loadavg, platform, release, arch } from 'node:os';
import { join, relative } from 'node:path';

/** @param {string} file @return {string} */
export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** @param {string} directory @return {string} */
export function sourceTreeHash(directory) {
  const files = [];
  function visit(current) {
    for (const name of readdirSync(current).sort()) {
      const file = join(current, name);
      const stat = statSync(file);
      if (stat.isDirectory()) visit(file);
      else files.push([relative(directory, file), readFileSync(file)]);
    }
  }
  visit(directory);
  return hashSourceFiles(files);
}

function hashSourceFiles(files) {
  const hash = createHash('sha256');
  for (const [name, data] of files)
    hash.update(name).update('\0').update(data).update('\0');
  return hash.digest('hex');
}

export function benchmarkHarnessFiles(root) {
  const files = [];
  const scripts = join(root, 'scripts');
  const lib = join(scripts, 'lib');
  const benchmarkDir = join(scripts, 'benchmark');
  function addTree(directory, prefix) {
    if (!existsSync(directory)) return;
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name);
      const stat = statSync(file);
      if (stat.isDirectory()) addTree(file, `${prefix}/${name}`);
      else files.push([`${prefix}/${name}`, readFileSync(file)]);
    }
  }
  addTree(lib, 'scripts/lib');
  addTree(benchmarkDir, 'scripts/benchmark');
  return files.sort(([a], [b]) => a.localeCompare(b));
}

export function benchmarkHarnessHash(root) {
  return hashSourceFiles(benchmarkHarnessFiles(root));
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function gitBuffer(root, args) {
  return execFileSync('git', args, { cwd: root });
}

function gitSourceTreeHash(root, ref) {
  const paths = git(root, ['ls-tree', '-r', '--name-only', ref, '--', 'src'])
    .split('\n')
    .filter(Boolean);
  return hashSourceFiles(
    paths.map((path) => [
      path.slice('src/'.length),
      gitBuffer(root, ['show', `${ref}:${path}`]),
    ])
  );
}

/** @param {string} root @param {string} baselineRef */
export function collectBenchmarkProvenance(
  root,
  {
    baselineRef = 'HEAD',
    benchmark = 'unknown',
    corpusPath,
    command = process.argv.join(' '),
  } = {}
) {
  const currentCommit = git(root, ['rev-parse', 'HEAD']);
  const baselineCommit = git(root, ['rev-parse', baselineRef]);
  const lockfile = join(root, 'pnpm-lock.yaml');
  let governor = null;
  try {
    governor = readFileSync(
      '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor',
      'utf8'
    ).trim();
  } catch {
    // Linux CPU governor is optional on other operating systems.
  }
  return {
    createdAt: new Date().toISOString(),
    command,
    benchmark,
    benchmarkHarnessHash: benchmarkHarnessHash(root),
    baselineCommit,
    worktreeCommit: currentCommit,
    baselineSourceHash: gitSourceTreeHash(root, baselineRef),
    worktreeSourceHash: sourceTreeHash(join(root, 'src')),
    baselineSourceTreeHash: gitSourceTreeHash(root, baselineRef),
    worktreeSourceTreeHash: sourceTreeHash(join(root, 'src')),
    sourceTreeHash: sourceTreeHash(join(root, 'src')),
    lockfileHash: sha256File(lockfile),
    corpusHash: corpusPath ? sha256File(corpusPath) : null,
    dirty: git(root, ['status', '--porcelain']) !== '',
    node: process.version,
    v8: process.versions.v8,
    cpu: cpus()[0]?.model ?? 'unknown',
    cpuCount: cpus().length,
    platform: `${platform()} ${release()} ${arch()}`,
    os: `${platform()} ${release()} ${arch()}`,
    loadAverage: loadavg(),
    linuxCpuGovernor: governor,
  };
}

export function collectEnvironment(root, baselineRef = 'HEAD') {
  return collectBenchmarkProvenance(root, { baselineRef });
}

/** @param {string} root @param {string} ref @return {{directory: string, sourceRoot: string, commit: string, cleanup: () => void}} */
export function materializeBaseline(root, ref) {
  // Keep the temporary tree below the project so ESM's normal package
  // resolution can reach the current checkout's installed dependencies.
  const directory = mkdtempSync(join(root, '.postcss-calc-baseline-'));
  mkdirSync(join(directory, 'src'), { recursive: true });
  try {
    const archive = execFileSync('git', ['archive', ref, '--', 'src'], {
      cwd: root,
    });
    execFileSync('tar', ['-x', '-f', '-', '-C', directory], { input: archive });
    return {
      directory,
      sourceRoot: join(directory, 'src'),
      commit: git(root, ['rev-parse', ref]),
      cleanup: () => rmSync(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

/** @param {string} worker @param {object} payload @param {string} cwd */
export function runChild(worker, payload, cwd) {
  const result = spawnSync(process.execPath, [worker], {
    cwd,
    encoding: 'utf8',
    input: JSON.stringify(payload),
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `benchmark child failed (${result.status}): ${result.stderr || result.stdout}`
    );
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `benchmark child returned invalid JSON: ${result.stdout.slice(0, 500)}`
    );
  }
}
