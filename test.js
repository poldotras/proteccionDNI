/**
Código específico de la página de pruebas: descarga la estructura del editor
desde editor.html para no duplicarla, carga sus scripts y añade la galería
de DNIs de ejemplo. Necesita un servidor web, no funciona abriendo el fichero.
*/
'use strict';

// scripts del editor, en el mismo orden en que los carga editor.html
const ScriptsEditor = [
	'formatos.js',
	'js/base.js',
	'js/procesador.js',
	'js/editorEsquinas.js',
	'js/resultado.js',
	'js/guardar.js',
	'js/pdf.js',
	'js/app.js',
];

fetch('editor.html')
	.then(respuesta => respuesta.text())
	.then(function (html) {
		// quitar el noscript antes de parsear: DOMParser trabaja sin javascript, por lo que
		// interpretaría su <style> interno y el CSP de la página rechaza los estilos inline
		const doc = new DOMParser().parseFromString(html.replace(/<noscript>[\s\S]*?<\/noscript>/g, ''), 'text/html');

		// inyectar la sección del editor y el bloque oculto con las respuestas de ayuda
		const contenedor = document.getElementById('ContenedorEditor');
		contenedor.appendChild(doc.getElementById('pasos'));
		contenedor.appendChild(doc.querySelector('main > div.Oculto'));

		// cargar los scripts del editor en orden, ahora que ya existen sus elementos
		return ScriptsEditor.reduce((previo, src) => previo.then(() => CargarScript(src)), Promise.resolve());
	})
	.then(ActivarGaleria)
	.catch(function (error) {
		console.error(error);
		alert('No se ha podido cargar el editor.\r\nLa página de pruebas necesita un servidor web, no funciona abriendo el fichero directamente.');
	});

function CargarScript(src) {
	return new Promise(function (resolve, reject) {
		const script = document.createElement('script');
		script.src = src;
		script.onload = resolve;
		script.onerror = () => reject('Error cargando ' + src);
		document.body.appendChild(script);
	});
}

function ActivarGaleria() {
	document.querySelectorAll('#Ejemplos img')
		.forEach(imagenDemo => {
			imagenDemo.title = imagenDemo.alt;
			imagenDemo.addEventListener('click', CambiarImagenTest);
		});
}

function CambiarImagenTest(ev) {
	const actual = document.querySelector('.Elegida');
	if (actual)
		actual.classList.remove('Elegida');

	const img = ev.target;
	img.classList.add('Elegida');

	nombreFichero = img.src;

	// si el nombre coincide con el de un formato, seleccionarlo automáticamente
	const match = /ejemplos\/(.*)\.webp/.exec(img.src);
	if (match) {
		ActualizarValorInput(Formato, match[1]);
	}

	EditarImagen(img);
}
