// dependency-cruiser config — enforces module-boundary rules.
// Keeps `lib/` PostCSS-free so it stays portable; the PostCSS adapter
// lives in src/index.js. Test code must not be reachable from production.

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies fragment reasoning across modules.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Orphan modules (not imported by anything) are usually dead code.',
      from: {
        orphan: true,
        pathNot: [
          '\\.(spec|test)\\.ts$',
          'src/index\\.js$',
          '\\.eslintrc\\.|\\.config\\.|\\.cjs$|\\.mjs$',
        ],
      },
      to: {},
    },
    {
      name: 'lib-no-postcss',
      severity: 'error',
      comment:
        'lib/ is the pure calc engine — no PostCSS imports. The adapter is src/index.js.',
      from: { path: '^src/lib/' },
      to: { path: 'postcss' },
    },
    {
      name: 'lib-no-entry-import',
      severity: 'error',
      comment: 'lib/ must not depend on the plugin entry — adapter direction is one-way.',
      from: { path: '^src/lib/' },
      to: { path: '^src/index\\.js$' },
    },
    {
      name: 'src-no-test-import',
      severity: 'error',
      comment: 'Production code must not reach into test/.',
      from: { path: '^src/(lib/|index\\.js)' },
      to: { path: '^src/pratt/test/' },
    },
    {
      name: 'no-deprecated-core',
      severity: 'error',
      comment: 'Avoid Node.js deprecated APIs (punycode, domain, etc.).',
      from: {},
      to: { dependencyTypes: ['deprecated'] },
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      comment: 'External imports must be in package.json.',
      from: {},
      to: {
        dependencyTypes: ['npm-no-pkg', 'npm-unknown'],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['main', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
