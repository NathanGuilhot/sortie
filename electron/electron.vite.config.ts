import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['shared', 'pipeline'],
      },
    },
  },
  preload: {
    // No preload scripts initially
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, '../shared/src'),
        '@pipeline': path.resolve(__dirname, '../pipeline/src'),
      },
    },
  },
});