import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
      },
    },
  },
  renderer: {
    root: '.',
    // draft-js / react-draft-wysiwyg (via fbjs) reference Node's `global`,
    // which doesn't exist in the browser. Map it to globalThis so the dev
    // server serves a working bundle (production builds bundle this away).
    define: {
      global: 'globalThis',
    },
    server: {
      watch: {
        // Ignore runtime-written directories so writes to workspace logs/,
        // memory/, and workspace-config.md never trigger a page reload.
        ignored: ['**/logs/**', '**/memory/**', '**/workspace-config.md'],
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    plugins: [react()],
  },
});
