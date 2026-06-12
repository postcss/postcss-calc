const js = require('@eslint/js');
const eslintConfigPrettier = require('eslint-config-prettier');
const sonarjs = require('eslint-plugin-sonarjs');

module.exports = [
  {
    ignores: ['node_modules/**', '.stryker-tmp/**', 'reports/**', 'types/**'],
  },
  js.configs.recommended,
  // SonarJS — code smells, cognitive complexity, dead stores, etc.
  {
    files: ['src/**/*.js', 'test/**/*.mjs', 'scripts/**/*.mjs'],
    plugins: { sonarjs },
    rules: {
      ...sonarjs.configs.recommended.rules,
      // Math hot paths (simplify, tokenizer, foldConstArgs, naive oracles)
      // have intrinsic complexity that's not extractable without diluting
      // single-pass intent. Default 15 is too tight; 25 still flags real
      // accidental complexity.
      'sonarjs/cognitive-complexity': ['error', 25],
    },
  },
  {
    rules: {
      // Underscore-prefix is the convention for "intentionally unused".
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
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
        fetch: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
];
