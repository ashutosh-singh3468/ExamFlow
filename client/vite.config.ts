import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.join(here, 'src'),
      '@shared': path.join(here, '..', 'shared'),
    },
  },
  css: {
    postcss: path.join(here),
  },
  server: {
    port: 5173,
    host: true,
    fs: { allow: [path.join(here, '..')] },
    proxy: { '/api': 'http://localhost:4000' },
  },
  build: {
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
