// dependency-cruiser config — enforces module-boundary rules for the
// TypeScript sources. Keeps `core/` PostCSS-free so it stays portable,
// and stops test code from being reachable from production.

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
          'src/pratt/src/plugin/plugin\\.ts$',
          'src/pratt/src/plugin/plugin-csstools\\.ts$',
          '\\.eslintrc\\.|\\.config\\.|\\.cjs$|\\.mjs$',
        ],
      },
      to: {},
    },
    {
      name: 'core-no-postcss',
      severity: 'error',
      comment:
        'core/ is the pure calc engine — no PostCSS imports. Adapters live in plugin/.',
      from: { path: '^src/pratt/src/core/' },
      to: { path: 'postcss' },
    },
    {
      name: 'core-no-plugin-import',
      severity: 'error',
      comment: 'core/ must not depend on plugin/ — adapter direction is one-way.',
      from: { path: '^src/pratt/src/core/' },
      to: { path: '^src/pratt/src/plugin/' },
    },
    {
      name: 'src-no-test-import',
      severity: 'error',
      comment: 'Production code must not reach into test/.',
      from: { path: '^src/pratt/src/' },
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
