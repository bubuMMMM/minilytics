import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-ssr/**', 'src/worker/**', 'api/**', 'scripts/**', 'test/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/dashboard/**/*.{ts,tsx}', 'src/shared/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // React 19 compiler rules (purity, set-state-in-effect) are too noisy on this
      // React 18 codebase (Date.now, theme hydration, data fetches).
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['src/shared/text.ts'],
    // Intentional control-character strip in sanitization.
    rules: { 'no-control-regex': 'off' },
  },
);
