import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'dist/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Warn primeiro — será promovido a error quando count chegar a zero
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      // S3 — leitura de tenantId/tenant_id DEVE passar por getTenantId()
      // (lib/jwt-claims): o JWT usa camelCase e o fallback snake_case existe
      // uma única vez no helper. Só proíbe a leitura NO objeto do usuário do
      // JWT (`user.tenantId`, `req.user?.tenant_id`, `(req as any).user?.tenantId`...);
      // campos de domínio com o mesmo nome (`this.tenantId`, `opts.tenantId`,
      // linhas do banco `invoice.tenant_id`) não são o alvo e seguem liberados.
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name=/^(tenantId|tenant_id)$/][object.name='user']",
          message: 'Use getTenantId() de lib/jwt-claims em vez de ler tenantId/tenant_id direto do usuário do JWT.',
        },
        {
          selector: "MemberExpression[property.name=/^(tenantId|tenant_id)$/][object.property.name='user']",
          message: 'Use getTenantId() de lib/jwt-claims em vez de ler tenantId/tenant_id direto do usuário do JWT.',
        },
      ],
    },
  },
  {
    // Exceções da regra S3: o próprio helper (implementa o fallback) e o login,
    // onde `user` é a LINHA da tabela `users` lida do banco (coluna real
    // tenant_id, não claim do JWT) antes da emissão do token.
    files: ['src/lib/jwt-claims.ts', 'src/domain/auth/login.route.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
