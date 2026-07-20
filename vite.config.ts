import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import handlebars from 'vite-plugin-handlebars';

// Sitio multipágina servido en un dominio propio (protegemidni.es), de ahí base '/'.
// El marcado común (cabecera y editor) se incluye desde src/partials/ en tiempo de
// build con handlebars, y los módulos worker se empaquetan como ESM.
export default defineConfig({
  base: '/',
  plugins: [
    handlebars({
      partialDirectory: resolve(__dirname, 'src/partials'),
    }),
  ],
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
