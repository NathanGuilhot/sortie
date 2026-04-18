import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import electron from 'electron';

const nativeOrRuntimeExternals = [
  'electron',
  'shared',
  'pipeline',
  'better-sqlite3',
  'canvas',
  'sharp',
  'onnxruntime-node',
  'sqlite-vec',
  'electron-store',
  'electron-updater',
  'chokidar',
  '@xenova/transformers',
  '@tensorflow/tfjs',
  '@tensorflow/tfjs-core',
  '@tensorflow/tfjs-backend-wasm',
  '@vladmandic/face-api',
];

export default defineConfig({
  electronPath: electron,
  main: {
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, '../shared/src'),
        '@pipeline': path.resolve(__dirname, '../pipeline/src'),
      },
    },
    build: {
      target: 'node18',
      outDir: 'dist/main',
      minify: 'esbuild',
      rollupOptions: {
        external: nativeOrRuntimeExternals,
      },
    },
  },
  preload: {
    build: {
      target: 'node18',
      outDir: 'dist/preload',
      minify: 'esbuild',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/preload/index.ts'),
        },
        external: nativeOrRuntimeExternals,
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