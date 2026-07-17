# Protección del DNI
Este proyecto es una página web simple para facilitar la tarea de enmascarar los datos privados del DNI si tenemos que compartir una foto y añadir una marca de agua indicando el uso por el que lo estamos compartiendo.
Las empresas no deben tener acceso a la mayoría de datos de tu DNI, por lo que si te piden una foto, lo que no hay que hacer es mandarles una foto original.

Todo el procesamiento se hace mediante javascript en tu ordenador/teléfono, no se envían los datos a ninguna parte, no se usan cookies ni servicios de terceros. 

Puedes [probarlo aquí](https://protegemidni.es/).  
Si quieres descargarte los ficheros para ejecutarlo desde tu ordenador, pincha en [Releases](https://github.com/AlfonsoML/proteccionDNI/releases) y bájate de ahí el último zip, lo descomprimes y abres el index.html 

## Estructura del código

- `index.html`: portada con la explicación, el ejemplo y las preguntas frecuentes
- `editor.html`: el editor donde se genera la copia protegida
- `test.html`: página de pruebas que carga la estructura de editor.html y añade una galería de DNIs de ejemplo
- `estilos.css`: los estilos de ambas páginas
- `formatos.js`: definición de los formatos de DNI (zonas a ocultar y de marca de agua)
- `worker.js`: WebWorker que procesa la imagen (blanco y negro, detección de esquinas, enderezado y giros)
- `js/info.js`: lógica de la portada (abrir preguntas enlazadas)
- `js/base.js`: referencias a los elementos del editor, estado compartido y utilidades
- `js/procesador.js`: comunicación con el WebWorker mediante promesas
- `js/editorEsquinas.js`: editor con los 4 puntos arrastrables, la lupa y los giros
- `js/resultado.js`: dibujado de la copia protegida, máscaras de censura y marca de agua
- `js/guardar.js`: composición de la imagen final, descarga y compartir
- `js/app.js`: flujo principal y cableado de eventos (se carga el último)
- `js/pdf.js`: extracción de la imagen incrustada en un pdf (escaneos y fotos guardadas como pdf), sin librerías externas
- `test.js`: código de la página de pruebas: descarga e inyecta el editor y activa la galería

Icono de máscara creado por [Andrew Nenakhov](https://pictogrammers.com/library/mdi/icon/domino-mask/).  
Icono candado para Web App por [Dios Campechano](https://mastodon.social/@Dios_Campechano@tkz.one/114094705033755223).  

