# Protección del DNI
Este proyecto es una página web simple para facilitar la tarea de enmascarar los datos privados del DNI si tenemos que compartir una foto y añadir una marca de agua indicando el uso por el que lo estamos compartiendo.
Las empresas no deben tener acceso a la mayoría de datos de tu DNI, por lo que si te piden una foto, lo que no hay que hacer es mandarles una foto original.

Todo el procesamiento se hace mediante javascript en tu ordenador/teléfono, no se envían los datos a ninguna parte, no se usan cookies ni servicios de terceros. 

Puedes [probarlo aquí](https://protegemidni.es/).

## Desarrollo

El proyecto usa [Vite](https://vitejs.dev/) y TypeScript. No hay dependencias en tiempo de
ejecución: en el navegador solo corre código propio (la detección, la homografía, etc. están
hechas a mano). Requiere un servidor web, ya no se abre directamente con `file://`.

```bash
npm install      # instalar las herramientas de desarrollo
npm run dev      # servidor de desarrollo con recarga en caliente
npm run build    # genera el sitio estático en dist/ (comprueba los tipos antes)
npm run preview  # sirve el build de producción para revisarlo
```

## Estructura del código

Las páginas (`index.html`, `editor.html`, `test.html`) están en la raíz y cargan sus módulos
de `src/`. Los estáticos (favicon, iconos, ejemplos, manifest, CNAME) están en `public/`.

- `src/tipos.ts`: tipos compartidos entre la interfaz y el worker (puntos, esquinas, mensajes)
- `src/formatos.ts`: definición de los formatos de DNI (zonas a ocultar y de marca de agua)
- `src/estado.ts`: estado compartido del editor en un único objeto mutable
- `src/dom.ts`: referencias tipadas a los elementos del editor
- `src/procesador.ts`: comunicación con el WebWorker mediante promesas
- `src/worker.ts`: WebWorker que procesa la imagen (blanco y negro, detección de esquinas, enderezado y giros)
- `src/editorEsquinas.ts`: editor con los 4 puntos arrastrables, la lupa y los giros
- `src/resultado.ts`: dibujado de la copia protegida y máscaras de censura
- `src/marcaAgua.ts`: marca de agua (ondas, rotación aleatoria y efecto lupa)
- `src/guardar.ts`: composición de la imagen final, descarga y compartir
- `src/app.ts`: flujo principal y cableado de eventos (punto de entrada del editor)
- `src/info.ts`: lógica de la portada (abrir preguntas enlazadas)
- `src/test.ts`: página de pruebas: inyecta el editor y activa la galería de ejemplos
- `src/estilos.css`, `src/test.css`: los estilos

El despliegue a GitHub Pages lo hace automáticamente el workflow `.github/workflows/deploy.yml`
en cada push a `main`.

Icono de máscara creado por [Andrew Nenakhov](https://pictogrammers.com/library/mdi/icon/domino-mask/).  
Icono candado para Web App por [Dios Campechano](https://mastodon.social/@Dios_Campechano@tkz.one/114094705033755223).  

