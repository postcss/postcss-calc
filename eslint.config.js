const js = require('@eslint/js');
const eslintConfigPrettier = require('eslint-config-prettier');
const sonarjs = require('eslint-plugin-sonarjs');
const tseslint = require('typescript-eslint');

module.exports = [
  {
    ignores: [
      'src/parser.js',
      'node_modules/**',
      '.stryker-tmp/**',
      'reports/**',
      'dist/**',
    ],
  },
  js.configs.recommended,
  // Type-aware lint for the TypeScript sources.
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({
    ...c,
    files: ['src/pratt/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      ...(c.languageOptions || {}),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
  })),
  // SonarJS — code smells, cognitive complexity, dead stores, etc.
  {
    files: ['src/pratt/**/*.ts', 'scripts/**/*.ts'],
    plugins: { sonarjs },
    rules: sonarjs.configs.recommended.rules,
  },
  // Project-specific lint adjustments for the TypeScript sources.
  {
    files: ['src/pratt/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      // Underscore-prefix is the convention for "intentionally unused".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Math hot paths (simplify, tokenizer, foldConstArgs, naive oracles)
      // have intrinsic complexity that's not extractable without diluting
      // single-pass intent. Default 15 is too tight; 25 still flags real
      // accidental complexity.
      'sonarjs/cognitive-complexity': ['error', 25],
    },
  },
  // node:test's `test()` returns a Promise we deliberately don't await —
  // the harness handles it. Silence no-floating-promises for test files.
  {
    files: ['src/pratt/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  eslintConfigPrettier,
  {
    files: ['src/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      curly: 'error',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        console: 'readonly',
        performance: 'readonly',
        process: 'readonly',
      },
    },
  },
];
