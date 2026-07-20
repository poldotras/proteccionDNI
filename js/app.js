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
Comenzar la edición con una imagen ya cargada: mostrar la zona de edición,
sortear las marcas y preparar el DNI. Se usa al elegir una foto y también
desde la galería de la página de pruebas
*/
function ComenzarEdicion(img) {
	document.getElementById('Edicion').classList.remove('Oculto');
	tarjetaResultado = null;
	SortearMarcas();

	PrepararDNI(img)
		.then(() => RedibujarDNI())
		.catch(error => {
			alert('Error preparando DNI \r\n' + error);
			console.error(error)
		});

	DibujarMascara();
	DibujarMarcaAgua();
}

/**
Cargar el fichero elegido como imagen y comenzar el proceso
*/
function MostrarImagen(file) {
	const img = new Image;
	img.onload = function () {
		URL.revokeObjectURL(img.src)
		ComenzarEdicion(img);
	}
	img.onerror = function (e) {
		console.log(e);
		alert('Por favor, escoge una imagen válida');
	}
	img.src = URL.createObjectURL(file);
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
			const escala = Math.min(1, 2000 / img.naturalWidth, 2000 / img.naturalHeight);
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
			canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
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

			// con una foto ya recortada a la tarjeta se ofrece buscar el DNI dentro
			MostrarBotonDeteccion(!!respuesta.recortada);

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

Watermark.addEventListener('input', function () {
	SortearMarcas();
	DibujarMarcaAgua();
});

botonGrabar.addEventListener('click', GrabarImagen);

configurarGiro();
configurarDeteccionManual();
configurarEditorEsquinas();
configurarCompartir();
configurarDD(document.body);
AsignarWatermarkPorDefecto(Watermark);

// Enlaces de ayuda: si el navegador soporta el Popover API, la respuesta se muestra
// sin salir de la página; si no, el propio enlace lleva a la pregunta en la portada
if (HTMLElement.prototype.hasOwnProperty('popover')) {
	document.querySelectorAll('.AbrirInfo[data-ayuda]')
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

			elmto.addEventListener('click', ev => {
				// no funciona bien, para cuando llegamos aquí el popover ya se ha cerrado por lo que se vuelve a mostrar
				if (popover.matches(':popover-open'))
					popover.hidePopover();
				else
					popover.showPopover();

				// lo ponemos por debajo del enlace
				const bb = elmto.getBoundingClientRect();
				popover.style.top = (bb.y + bb.height + 10) + 'px';

				ev.preventDefault();
			});
		});
}
