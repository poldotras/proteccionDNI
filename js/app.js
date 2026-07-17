/**
Flujo principal de la aplicación: modo edición, carga de la foto,
preparación del DNI y el cableado de todos los eventos de la página.
Debe cargarse el último, cuando ya están definidos el resto de ficheros de js/.
*/
'use strict';

//////////////////////////////////////
//
// Carga de la foto
//
//////////////////////////////////////

/**
Mostrar la zona de edición al cargar la primera foto
*/
function MostrarEdicion() {
	document.getElementById('Edicion').classList.remove('Oculto');
}

/**
Comenzar la edición con la imagen indicada (un <img> o un canvas)
*/
function EditarImagen(imagen) {
	MostrarEdicion();
	tarjetaResultado = null;

	PrepararDNI(imagen)
		.then(() => RedibujarDNI())
		.catch(error => {
			alert('Error preparando DNI \r\n' + error);
			console.error(error)
		});

	DibujarMascara();
	DibujarMarcaAgua();
}

/**
Cargar el fichero elegido (imagen o pdf) y comenzar el proceso
*/
function MostrarImagen(file) {
	if (EsPdf(file)) {
		MostrarPdf(file);
		return;
	}

	const img = new Image;
	img.onload = function () {
		URL.revokeObjectURL(img.src)
		EditarImagen(img);
	}
	img.onerror = function (e) {
		console.log(e);
		alert('Por favor, escoge una imagen válida');
	}
	img.src = URL.createObjectURL(file);
}

function EsPdf(file) {
	return file.type == 'application/pdf' || /\.pdf$/i.test(file.name);
}

// promesa de la carga de pdf.js, que solo se descarga la primera vez que se elige un pdf
let cargaPdfJs = null;

function CargarPdfJs() {
	if (!cargaPdfJs) {
		cargaPdfJs = new Promise(function (resolve, reject) {
			const script = document.createElement('script');
			script.src = 'lib/pdf.min.js';
			script.onload = function () {
				pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
				resolve();
			};
			script.onerror = () => reject(new Error('No se ha podido cargar lib/pdf.min.js'));
			document.body.appendChild(script);
		});
	}
	return cargaPdfJs;
}

/**
Renderizar la primera página del pdf a un canvas y editarla como una imagen normal
*/
function MostrarPdf(file) {
	Promise.all([CargarPdfJs(), file.arrayBuffer()])
		// isEvalSupported evita que pdf.js use eval con las fuentes, que el CSP no permite
		.then(([, buffer]) => pdfjsLib.getDocument({ data: buffer, isEvalSupported: false }).promise)
		.then(pdf => pdf.getPage(1))
		.then(function (pagina) {
			// renderizar con buena resolución: el procesado trabaja hasta a 2000px de ancho
			const base = pagina.getViewport({ scale: 1 });
			const viewport = pagina.getViewport({ scale: 2000 / base.width });
			const canvasPdf = document.createElement('canvas');
			canvasPdf.width = viewport.width;
			canvasPdf.height = viewport.height;
			return pagina.render({ canvasContext: canvasPdf.getContext('2d'), viewport }).promise
				.then(() => EditarImagen(canvasPdf));
		})
		.catch(function (error) {
			console.error(error);
			alert('No se ha podido leer el pdf\r\n' + error);
		});
}

/**
Crear el ImageBitmap que se envía al WebWorker.
Con algunas fotos (los móviles actuales generan imágenes enormes) createImageBitmap
falla con "The ImageBitmap could not be allocated"; en ese caso reducimos la foto
pasándola por un canvas. No se pierde calidad: el worker trabaja a 2000px como máximo.
*/
function CrearBitmap(img) {
	return createImageBitmap(img)
		.catch(function () {
			// la fuente puede ser un <img> (naturalWidth) o un canvas (width)
			const ancho = img.naturalWidth || img.width;
			const alto = img.naturalHeight || img.height;
			const escala = Math.min(1, 2000 / ancho, 2000 / alto);
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round(ancho * escala));
			canvas.height = Math.max(1, Math.round(alto * escala));
			canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
			return createImageBitmap(canvas);
		});
}

/**
Tomamos la imagen original del DNI y la preparamos a blanco y negro,
detectando las esquinas de la tarjeta y enderezándola si es posible.
Devuelve una promesa
*/
function PrepararDNI(img) {
	// creamos un objeto transferable que podamos enviar al WebWorker
	return CrearBitmap(img)
		.then(bitmap => EnviarAlWorker({ bitmap }))
		.then(function (respuesta) {
			imagenOriginalBN = respuesta.bitmap;
			// el editor de esquinas muestra la foto en color; si no está disponible, la de blanco y negro
			imagenOriginalColor = respuesta.bitmapColor || respuesta.bitmap;
			imagenDNI_BN = respuesta.bitmap;

			if (respuesta.esquinas)
				esquinasDNI = respuesta.esquinas;
			else if (respuesta.tarjeta)
				esquinasDNI = RectanguloAEsquinas(respuesta.tarjeta);
			else
				esquinasDNI = EsquinasPorDefecto();

			DibujarEditorEsquinas();

			// si la detección de esquinas es fiable, enderezar la tarjeta directamente
			if (respuesta.esquinas)
				return AplicarEsquinas();

			tarjetaResultado = respuesta.tarjeta;
		});
}

/**
Permitir arrastrar y soltar una foto sobre la página
*/
function configurarDD(root) {
	root.addEventListener('dragenter', function (event) {
		if (!hasFiles(event))
			return;

		root.classList.add('dragover');

		// solo Chrome cambia el cursor
		// http://stackoverflow.com/questions/24000954/in-firefox-and-ie-how-can-change-the-cursor-while-dragging-over-different-target
		event.dataTransfer.dropEffect = 'copy';
	}, false);

	root.addEventListener('dragleave', function (event) {
		if (!event.dataTransfer)
			return;

		if (event.target != root && event.srcElement != root && event.toElement != root)
			return;

		root.classList.remove('dragover');
	}, false);

	root.addEventListener('dragover', function (event) {
		if (!hasFiles(event))
			return;

		// solo Chrome cambia el cursor
		event.dataTransfer.dropEffect = 'copy';

		// evitamos que al soltar lo procese el navegador
		event.preventDefault();
	}, false);

	root.addEventListener('drop', function (event) {
		event.preventDefault();
		const dataTransfer = event.dataTransfer;
		if (!dataTransfer)
			return;

		root.classList.remove('dragover');

		const fichero = dataTransfer.files[0];
		MostrarImagen(fichero);
		nombreFichero = fichero.name;
	}, false);
}

function hasFiles(ev) {
	const data = ev.dataTransfer;
	return !!data && !!data.types && Array.prototype.includes.call(data.types, 'Files');
}

//////////////////////////////////////
//
// Inicialización
//
//////////////////////////////////////

// Rellenar la lista de formatos de DNI automáticamente
Formato.innerHTML = Object.entries(FormatosDnis)
	.map(([clave, formato]) => `<option value='${clave}'>${formato.Nombre}</option>`)
	.join('');

SelectorFichero.addEventListener('change', function (e) {
	const fichero = e.target.files[0];
	if (fichero) {
		MostrarImagen(fichero);
		nombreFichero = e.target.value;
		// borramos por si quieren volver a elegir la misma
		e.target.value = '';
	}
});

// botón "bonito" para el usuario
document.getElementById('ZonaElegir')
	.addEventListener('click', () => SelectorFichero.click());

[Formato, EnmascararDni, Validez].forEach(function (control) {
	control.addEventListener('change', function (e) {
		if (e.target == Formato) {
			// ajustar visibilidad de los checkbox dependiendo de las opciones del formato elegido
			const formato = FormatosDnis[Formato.value];
			DivMascaraDni.classList.toggle('Oculto', !formato.MascarasDni);
			DivValidez.classList.toggle('Oculto', !formato.DatosValidez);
		}

		DibujarMascara();
		DibujarMarcaAgua();
	});
});

Watermark.addEventListener('input', () => DibujarMarcaAgua());

botonGrabar.addEventListener('click', GrabarImagen);

configurarGiro();
configurarEditorEsquinas();
configurarCompartir();
configurarDD(document.body);
AsignarWatermarkPorDefecto(Watermark);

// Enlaces de ayuda: si el navegador soporta el Popover API, la respuesta se muestra
// sin salir de la página; si no, el propio enlace lleva a la pregunta en la portada
if (HTMLElement.prototype.hasOwnProperty('popover')) {
	querySelector_Array('.AbrirInfo[data-ayuda]')
		.forEach(elmto => {
			const respuesta = document.querySelector('#' + elmto.dataset.ayuda + ' .respuesta');
			if (!respuesta)
				return;

			// clonamos el contenido para mostrarlo como popover bajo el enlace
			const popover = respuesta.cloneNode(true);
			popover.classList.remove('respuesta');
			popover.popover = 'auto';
			elmto.parentNode.appendChild(popover);
			elmto.popoverTargetElement = popover;

			activarClickConTeclado(elmto, (target, ev) => {
				// no funciona bien, para cuando llegamos aquí el popover ya se ha cerrado por lo que se vuelve a mostrar
				if (popover.matches(':popover-open'))
					popover.hidePopover();
				else
					popover.showPopover();

				// lo ponemos por debajo del enlace
				const bb = target.getBoundingClientRect();
				popover.style.top = (bb.y + bb.height + 10) + 'px';

				ev.preventDefault();
			});
		});
}
