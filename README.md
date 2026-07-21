# Protección del DNI
Este proyecto es una página web simple para facilitar la tarea de enmascarar los datos privados del DNI si tenemos que compartir una foto y añadir una marca de agua indicando el uso por el que lo estamos compartiendo.
Las empresas no deben tener acceso a la mayoría de datos de tu DNI, por lo que si te piden una foto, lo que no hay que hacer es mandarles una foto original.

Todo el procesamiento se hace mediante javascript en tu ordenador/teléfono, no se envían los datos a ninguna parte, no se usan cookies ni servicios de terceros. 

Puedes [probarlo aquí](https://protegemidni.es/).

## Desarrollo

El proyecto usa [Vite](https://vitejs.dev/) y TypeScript, con [pnpm](https://pnpm.io/) como
gestor de paquetes. No hay dependencias en tiempo de ejecución: en el navegador solo corre
código propio (la detección, la homografía, etc. están hechas a mano). Requiere un servidor
web, ya no se abre directamente con `file://`.

```bash
pnpm install    # instalar las herramientas de desarrollo
pnpm dev        # servidor de desarrollo con recarga en caliente
pnpm build      # comprueba los tipos y genera el sitio estático en dist/
pnpm preview    # sirve el build de producción para revisarlo
```

## Estructura del código

Las páginas (`index.html`, `editor.html`, `test.html`) están en la raíz. El marcado común
(la cabecera y el editor) se incluye desde `src/partials/` en tiempo de build con
[handlebars](https://github.com/alexlafroscia/vite-plugin-handlebars), así que no se duplica
ni se inyecta por JS. Los estáticos (favicon, iconos, ejemplos, manifest) están en
`public/`.

- `src/tipos.ts`: tipos compartidos entre la interfaz y el worker (puntos, esquinas, mensajes)
- `src/formatos.ts`: definición de los formatos de DNI (zonas a ocultar y de marca de agua)
- `src/portada.ts`: lógica de la portada (abrir preguntas enlazadas)
- `src/partials/`: marcado HTML compartido (`cabecera.hbs`, `editor.hbs`)
- `src/editor/`: código de la interfaz (hilo principal)
  - `dom.ts`: referencias tipadas a los elementos del editor
  - `estado.ts`: estado compartido en un único objeto mutable
  - `procesador.ts`: comunicación con el WebWorker mediante promesas
  - `esquinas.ts`: editor con los 4 puntos arrastrables, la lupa y los giros
  - `resultado.ts`: dibujado de la copia protegida y máscaras de censura
  - `marcaAgua.ts`: marca de agua (ondas, rotación aleatoria y efecto lupa)
  - `guardar.ts`: composición de la imagen final, descarga y compartir
  - `editor.ts`: flujo principal y cableado de eventos (entrada de `editor.html`)
  - `pruebas.ts`: galería de ejemplos y panel de coordenadas (entrada de `test.html`)
- `src/worker/`: WebWorker que procesa la imagen, repartido por etapas
  - `worker.ts`: punto de entrada, estado y mensajes
  - `imagen.ts`: blanco y negro, orientación, escalado y muestreo
  - `geometria.ts`: utilidades de puntos y cuadriláteros
  - `deteccion.ts`: detección por máscara de contraste con el fondo
  - `hough.ts`: detección por rectas dominantes (Hough por gradiente)
  - `refinado.ts`: refinado de esquinas por barrido de rectas y validación
  - `enderezado.ts`: corrección de perspectiva (homografía)
- `src/estilos.css`: los estilos comunes (la página de pruebas añade `src/editor/pruebas.css`)

## Despliegue

No se despliega en ningún hosting automáticamente. En cada push a `main`, el workflow
`.github/workflows/release.yml` construye el sitio y publica el `dist` como un zip en un
tag/release, para poder descargarlo y ejecutarlo en local sirviéndolo con un servidor
estático (por ejemplo `npx serve` o `python3 -m http.server`).

Icono de máscara creado por [Andrew Nenakhov](https://pictogrammers.com/library/mdi/icon/domino-mask/).  
Icono candado para Web App por [Dios Campechano](https://mastodon.social/@Dios_Campechano@tkz.one/114094705033755223).  

