import { defineConfig } from 'vitest/config';
import path from 'path';

// Dois projetos: frontend (jsdom) para src/**, backend (node) para apps/** e
// packages/**. O SDK da OpenAI recusa rodar em ambiente browser-like — os
// testes de apps/api precisam de node puro.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, '$1') }
    ]
  },
  test: {
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/playwright/**', '**/.stryker-tmp/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules', 'dist', 'scripts']
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'frontend',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/**/*.test.{ts,tsx}', 'index.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'backend',
          environment: 'node',
          setupFiles: ['./vitest.setup.ts'],
          include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'scripts/**/*.test.ts'],
        },
      },
    ],
  },
})
