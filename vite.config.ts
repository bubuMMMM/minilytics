import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/dashboard',
  publicDir: '../../public',
  plugins: [react()],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: a dashboard deploy doesn't invalidate React/recharts in visitors' caches.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap|decimal\.js-light|lodash|react-smooth|recharts-scale|eventemitter3|tiny-invariant|clsx|fast-equals|react-transition-group|dom-helpers)[\\/]/.test(id)) return 'charts';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
});
