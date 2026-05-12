module.exports = {
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    '@typescript-eslint/recommended-requiring-type-checking',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: [
    '@typescript-eslint',
    'kanvas-anti-patterns',
  ],
  rules: {
    // TypeScript recommended rules
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    
    // KANVAS-specific anti-pattern rules
    'kanvas-anti-patterns/no-forbidden-fields': 'error',
    'kanvas-anti-patterns/no-direct-localstorage': 'error',
    'kanvas-anti-patterns/no-embedded-files': 'error',
    'kanvas-anti-patterns/no-sync-state-pollution': 'error',
    'kanvas-anti-patterns/no-ui-state-pollution': 'error',
    'kanvas-anti-patterns/no-behavior-branching': 'warn',
    'kanvas-anti-patterns/no-full-project-reload': 'error',
    'kanvas-anti-patterns/no-conditional-schema': 'error',
    'kanvas-anti-patterns/require-zone-separation': 'error',
    // NEW rules from persistence rewrite plan
    'kanvas-anti-patterns/no-asset-type-branching': 'error',
    'kanvas-anti-patterns/no-sync-state-in-assets': 'error',
    'kanvas-anti-patterns/require-canonical-structure': 'error',
    
    // Performance rules
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-alert': 'error',
    
    // Code quality rules
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
    'prefer-destructuring': 'warn',
    
    // Async/await rules
    'no-async-promise-executor': 'error',
    'prefer-promise-reject-errors': 'error',
    
    // Import rules
    'no-duplicate-imports': 'error',
    'order-imports': ['warn', {
      groups: [
        'builtin',
        'external',
        'internal',
        'parent',
        'sibling',
        'index',
      ],
    }],
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      env: {
        jest: true,
      },
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      files: ['**/migrations/**', '**/supabase/migrations/**'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      files: ['src/types/**'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
