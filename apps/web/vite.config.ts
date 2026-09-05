import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: process.env.VITE_API_URL ?? 'http://localhost:4000', changeOrigin: true },
      // Socket.IO's transport lives at /socket.io; '/realtime' is a
      // namespace inside it, not a URL path, so proxying that name alone
      // let websocket traffic fall through to the SPA fallback.
      '/socket.io': { target: process.env.VITE_API_URL ?? 'http://localhost:4000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Recharts is only reachable from the analytics screens, which are
        // lazily routed. Splitting it keeps it out of the first paint.
        manualChunks: {
          charts: ['recharts'],
          // The PDF renderer is only reached from the paper and quiz
          // pages, and only after a sheet exists to render.
          pdf: ['@react-pdf/renderer'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
        },
      },
    },
  },
});
