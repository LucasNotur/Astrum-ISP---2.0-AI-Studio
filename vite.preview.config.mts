// TEMP config for Claude beta-testing — frontend-only Vite dev server.
// No Express/Fastify/BullMQ workers boot here, so it cannot double-process
// the shared Redis/Supabase queues. /api is proxied to the running :3000 app.
// dotenv MUST load before ./vite.config so its `define` sees VITE_SUPABASE_* .
import 'dotenv/config';
import { mergeConfig } from 'vite';
import base from './vite.config';

export default mergeConfig(base, {
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
});
