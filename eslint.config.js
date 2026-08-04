import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Lint rules that encode Constitution constraints are in scripts/validate-scope.mjs, not here —
 * ESLint sees only TypeScript, while the scope rules must also cover SQL, YAML, and directory
 * layout. This config covers ordinary code correctness.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.turbo/**',
      // Immutable handoff package and its generated operational copies.
      'docs/production-handoff/**',
      'adr/**',
      'checklists/**',
      'config/**',
      'schemas/**',
      'db/reference/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node globals, declared rather than pulled in via an extra dependency.
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        structuredClone: 'readonly',
      },
    },
  },
  {
    // Root-level config files are not members of any package tsconfig, so the type-aware
    // service cannot resolve them. Lint them syntactically instead of not at all.
    files: ['*.config.ts', 'vitest.workspace.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['packages/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  {
    // CLIs and scripts legitimately write to stdout.
    files: ['**/cli.ts', '**/scripts/**', '**/*.config.ts', 'vitest.workspace.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/test/**/*.ts'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
