/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  // loadEnv também lê o .env do projeto — process.env sozinho não pega essas vars
  // (só as exportadas de fato no shell), o que fazia o client cair no fallback
  // 'placeholder.supabase.co' e o login falhar com ERR_NAME_NOT_RESOLVED.
  const env = loadEnv(mode, process.cwd(), '');
  return {
  root: '.',
  plugins: [
    react(),
    tailwindcss(),
    // U7-04: bundle report gerado apenas quando ANALYZE=true (npm run build:analyze)
    ...(process.env.ANALYZE === 'true'
      ? [visualizer({ open: true, filename: 'dist/bundle-report.html', gzipSize: true, brotliSize: true })]
      : []),
  ],
  resolve: {
    alias: [
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, '$1') }
    ],
    tsconfigPaths: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // U7-04: chunks manuais — separa vendors pesados do bundle principal
        manualChunks(id) {
          // MapLibre no próprio chunk: no chunk principal, um símbolo interno dele
          // colidia com o de outra lib sob a minificação do rolldown (Vite 8),
          // virando "Zp is not defined" em produção — a linha de rota (e outras
          // ops MapLibre em runtime) quebrava só no build minificado, não em dev.
          if (id.includes('node_modules/maplibre-gl')) {
            return 'vendor-maplibre';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          if (id.includes('node_modules/@tanstack')) {
            return 'vendor-query';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (id.includes('node_modules/@radix-ui')) {
            return 'vendor-radix';
          }
        },
      },
    },
  },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.URL_SUPABASE || env.SUPABASE_URL || ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KE || '')
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['node_modules', 'dist', 'apps/web/e2e/**'],
    alias: [
      { find: /^@\/(.*)/, replacement: path.resolve(__dirname, '$1') }
    ],
    server: {
      deps: {
        inline: [/^@\//]
      }
    }
  }
  };
});
