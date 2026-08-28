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
    // Vite por padrão pré-carrega (modulepreload) chunks vendor compartilhados
    // entre múltiplas rotas lazy direto no index.html — isso baixava vendor-charts
    // (recharts+d3, 747KB) e vendor-maplibre (1MB) em TODA rota, inclusive login,
    // anulando o code-splitting das rotas. Desligado: cada chunk só baixa quando
    // a rota que o importa de verdade é visitada.
    modulePreload: false,
    rollupOptions: {
      output: {
        // U7-04: chunks manuais — separa vendors pesados do bundle principal
        //
        // recharts/d3-* NÃO entram aqui de propósito (removidos 2026-08-28): agrupar
        // as ~50 submodules internas do recharts num chunk nomeado ("vendor-charts")
        // fazia o Rolldown (bundler do Vite 8) tratar o chunk inteiro como dependência
        // estática do entry point, baixando os 747KB em TODA rota (inclusive /login),
        // mesmo só sendo usado por páginas 100% lazy (DashboardPage, BillingPage etc.).
        // Confirmado ao vivo via network tab: com o grouping manual, vendor-charts
        // aparecia junto do chunk de entrada; sem ele, o Rolldown particiona o
        // recharts sozinho em chunks assíncronos (CategoricalChart/CartesianChart)
        // que só carregam quando a rota lazy correspondente é visitada. Não reintroduzir
        // sem reconfirmar isso no network tab de verdade — o sintoma some silenciosamente
        // no `npm run build` (nenhum warning), só aparece em runtime.
        manualChunks(id) {
          // MapLibre no próprio chunk: no chunk principal, um símbolo interno dele
          // colidia com o de outra lib sob a minificação do rolldown (Vite 8),
          // virando "Zp is not defined" em produção — a linha de rota (e outras
          // ops MapLibre em runtime) quebrava só no build minificado, não em dev.
          // Confirmado que este NÃO sofre do mesmo bug de eager-load do recharts acima
          // (network tab: só carrega em /map, /tecnico, /tech-preview).
          if (id.includes('node_modules/maplibre-gl')) {
            return 'vendor-maplibre';
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
