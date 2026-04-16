import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  // 1. Global ignores
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/node_modules/**',
      '*.js',
      '**/*.cjs',
      'electron/scripts/**',
      'pipeline/src/scripts/**',
    ],
  },

  // 2. Base: all TypeScript files
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'off',
    },
  },

  // 3. React renderer files
  {
    files: ['electron/src/renderer/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // 4. Electron main + preload (Node environment)
  {
    files: ['electron/src/main/**/*.ts', 'electron/src/preload/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // 5. Pipeline + shared (Node environment)
  {
    files: ['pipeline/src/**/*.ts', 'shared/src/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
