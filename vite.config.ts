/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
  root: '.',
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    alias: [
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, '$1') }
    ]
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL || process.env.URL_SUPABASE || process.env.SUPABASE_URL || ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KE || '')
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    alias: [
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, '$1') }
    ],
    server: {
      deps: {
        inline: [/^@\//]
      }
    }
  }
});
