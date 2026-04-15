import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import electron from 'electron';

export default defineConfig({
  electronPath: electron,
  main: {
    build: {
      target: 'node18',
      outDir: 'dist/main',
      rollupOptions: {
        external: ['shared', 'pipeline'],
      },
    },
  },
  preload: {
    build: {
      target: 'node18',
      outDir: 'dist/preload',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    build: {
      target: 'chrome118',
      outDir: 'dist/renderer',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, '../shared/src'),
        '@pipeline': path.resolve(__dirname, '../pipeline/src'),
      },
    },
  },
});