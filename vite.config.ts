import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Sitio multipágina servido en un dominio propio (protegemidni.es), de ahí base '/'.
// Los módulos worker se empaquetan como ESM.
export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
        test: resolve(__dirname, 'test.html'),
      },
    },
  },
  worker: {
    format: 'es',
  },
});
