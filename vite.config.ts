import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import handlebars from 'vite-plugin-handlebars';

import { cloudflare } from "@cloudflare/vite-plugin";

// Sitio multipágina servido en un dominio propio (protegemidni.es), de ahí base '/'.
// El marcado común (cabecera y editor) se incluye desde src/partials/ en tiempo de
// build con handlebars, y los módulos worker se empaquetan como ESM.
export default defineConfig(({ command }) => {
  const desarrollo = command === 'serve';

  // Política de seguridad de contenido. En producción es estricta; en desarrollo
  // se relaja lo justo para el servidor de Vite (websocket de HMR y estilos inline
  // que inyecta la recarga en caliente). Debería ir en una cabecera HTTP, pero
  // GitHub Pages no las soporta, así que se mete como <meta> en la cabecera.
  const csp = [
    "script-src 'self'",
    "script-src-attr 'none'",
    desarrollo ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
    "img-src 'self' blob: data:",
    "media-src 'none'",
    "font-src 'self'",
    desarrollo ? "connect-src 'self' ws: data:" : "connect-src data:",
    "worker-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
  ].join('; ') + ';';

  return {
    base: '/',
    plugins: [handlebars({
      partialDirectory: resolve(__dirname, 'src/partials'),
      context: { csp },
    }), cloudflare()],
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
  };
});