// vite.config.ts
import { defineConfig } from "file:///app/applet/node_modules/vite/dist/node/index.js";
import react from "file:///app/applet/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///app/applet/node_modules/@tailwindcss/vite/dist/index.mjs";
import tsconfigPaths from "file:///app/applet/node_modules/vite-tsconfig-paths/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "/app/applet";
var vite_config_default = defineConfig({
  root: ".",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    alias: [
      { find: /^@\/(.*)/, replacement: path.resolve(__vite_injected_original_dirname, "$1") }
    ]
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL || process.env.URL_SUPABASE || process.env.SUPABASE_URL || ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KE || "")
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    alias: [
      { find: /^@\/(.*)/, replacement: path.resolve(__vite_injected_original_dirname, "$1") }
    ],
    server: {
      deps: {
        inline: [/^@\//]
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvYXBwL2FwcGxldFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2FwcC9hcHBsZXQvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2FwcC9hcHBsZXQvdml0ZS5jb25maWcudHNcIjsvLy8gPHJlZmVyZW5jZSB0eXBlcz1cInZpdGVzdFwiIC8+XG5pbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSAnQHRhaWx3aW5kY3NzL3ZpdGUnO1xuaW1wb3J0IHRzY29uZmlnUGF0aHMgZnJvbSAndml0ZS10c2NvbmZpZy1wYXRocyc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcm9vdDogJy4nLFxuICBwbHVnaW5zOiBbcmVhY3QoKSwgdGFpbHdpbmRjc3MoKSwgdHNjb25maWdQYXRocygpXSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiBbXG4gICAgICB7IGZpbmQ6IC9eQFxcLyguKikvLCByZXBsYWNlbWVudDogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJyQxJykgfVxuICAgIF1cbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6ICdkaXN0L2NsaWVudCcsXG4gICAgZW1wdHlPdXREaXI6IHRydWVcbiAgfSxcbiAgZGVmaW5lOiB7XG4gICAgJ2ltcG9ydC5tZXRhLmVudi5WSVRFX1NVUEFCQVNFX1VSTCc6IEpTT04uc3RyaW5naWZ5KHByb2Nlc3MuZW52LlZJVEVfU1VQQUJBU0VfVVJMIHx8IHByb2Nlc3MuZW52LlVSTF9TVVBBQkFTRSB8fCBwcm9jZXNzLmVudi5TVVBBQkFTRV9VUkwgfHwgJycpLFxuICAgICdpbXBvcnQubWV0YS5lbnYuVklURV9TVVBBQkFTRV9BTk9OX0tFWSc6IEpTT04uc3RyaW5naWZ5KHByb2Nlc3MuZW52LlZJVEVfU1VQQUJBU0VfQU5PTl9LRVkgfHwgcHJvY2Vzcy5lbnYuU1VQQUJBU0VfQU5PTl9LRVkgfHwgcHJvY2Vzcy5lbnYuU1VQQUJBU0VfQU5PTl9LRSB8fCAnJylcbiAgfSxcbiAgdGVzdDoge1xuICAgIGVudmlyb25tZW50OiAnanNkb20nLFxuICAgIGdsb2JhbHM6IHRydWUsXG4gICAgc2V0dXBGaWxlczogWycuL3ZpdGVzdC5zZXR1cC50cyddLFxuICAgIGFsaWFzOiBbXG4gICAgICB7IGZpbmQ6IC9eQFxcLyguKikvLCByZXBsYWNlbWVudDogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJyQxJykgfVxuICAgIF0sXG4gICAgc2VydmVyOiB7XG4gICAgICBkZXBzOiB7XG4gICAgICAgIGlubGluZTogWy9eQFxcLy9dXG4gICAgICB9XG4gICAgfVxuICB9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFDQSxTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFdBQVc7QUFDbEIsT0FBTyxpQkFBaUI7QUFDeEIsT0FBTyxtQkFBbUI7QUFDMUIsT0FBTyxVQUFVO0FBTGpCLElBQU0sbUNBQW1DO0FBT3pDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLE1BQU07QUFBQSxFQUNOLFNBQVMsQ0FBQyxNQUFNLEdBQUcsWUFBWSxHQUFHLGNBQWMsQ0FBQztBQUFBLEVBQ2pELFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEVBQUUsTUFBTSxZQUFZLGFBQWEsS0FBSyxRQUFRLGtDQUFXLElBQUksRUFBRTtBQUFBLElBQ2pFO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsYUFBYTtBQUFBLEVBQ2Y7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLHFDQUFxQyxLQUFLLFVBQVUsUUFBUSxJQUFJLHFCQUFxQixRQUFRLElBQUksZ0JBQWdCLFFBQVEsSUFBSSxnQkFBZ0IsRUFBRTtBQUFBLElBQy9JLDBDQUEwQyxLQUFLLFVBQVUsUUFBUSxJQUFJLDBCQUEwQixRQUFRLElBQUkscUJBQXFCLFFBQVEsSUFBSSxvQkFBb0IsRUFBRTtBQUFBLEVBQ3BLO0FBQUEsRUFDQSxNQUFNO0FBQUEsSUFDSixhQUFhO0FBQUEsSUFDYixTQUFTO0FBQUEsSUFDVCxZQUFZLENBQUMsbUJBQW1CO0FBQUEsSUFDaEMsT0FBTztBQUFBLE1BQ0wsRUFBRSxNQUFNLFlBQVksYUFBYSxLQUFLLFFBQVEsa0NBQVcsSUFBSSxFQUFFO0FBQUEsSUFDakU7QUFBQSxJQUNBLFFBQVE7QUFBQSxNQUNOLE1BQU07QUFBQSxRQUNKLFFBQVEsQ0FBQyxNQUFNO0FBQUEsTUFDakI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
