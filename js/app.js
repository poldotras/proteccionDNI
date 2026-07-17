/**
Flujo principal de la aplicación: modo edición, carga de la foto,
preparación del DNI y el cableado de todos los eventos de la página.
Debe cargarse el último, cuando ya están definidos el resto de ficheros de js/.
*/
'use strict';

//////////////////////////////////////
//
// Modo edición
//
//////////////////////////////////////

function ActivarModoEdicion() {
	document.body.classList.add('Editando');
	document.getElementById('Edicion').classList.remove('Oculto');
	// Que no se salga el teclado a elementos no visibles
	querySelector_Array('.informacion, footer')
		.forEach(bloque => bloque.inert = true);
}

function DesactivarModoEdicion() {
	document.body.classList.remove('Editando');
	// Restaurar interactividad
	querySelector_Array('.informacion, footer')
		.forEach(bloque => bloque.inert = false);
}

//////////////////////////////////////
//
// Carga de la foto
//
//////////////////////////////////////

/**
Cargar el fichero elegido como imagen y comenzar el proceso
*/
function MostrarImagen(file) {
	const img = new Image;
	img.onload = function () {
		URL.revokeObjectURL(img.src)

		ActivarModoEdicion();
		posicionAutomatica = null;
		ResetearControles();
		AjustarVisibilidadResetear();

		PrepararDNI(img)
			.then(() => RedibujarDNI())
			.catch(error => {
				alert('Error preparando DNI \r\n' + error);
				console.error(error)
			});

		DibujarMascara();
		DibujarMarcaAgua();
	}
	img.onerror = function (e) {
		console.log(e);
		alert('Por favor, escoge una imagen válida');
	}
	img.src = URL.createObjectURL(file);
}

/**
Tomamos la imagen original del DNI y la preparamos a blanco y negro,
detectando las esquinas de la tarjeta y enderezándola si es posible.
Devuelve una promesa
*/
function PrepararDNI(img) {
	// creamos un objeto transferable que podamos enviar al WebWorker
	return createImageBitmap(img)
		.then(bitmap => EnviarAlWorker({ bitmap }))
		.then(function (respuesta) {
			imagenOriginalBN = respuesta.bitmap;
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

			AjustarPosicionAutomatica(respuesta.tarjeta);
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

[Rotacion, Horizontal, Vertical, Zoom].forEach(function (control) {
	control.addEventListener('input', function () {
		RedibujarDNI();
		AjustarVisibilidadResetear();
	});
});

Watermark.addEventListener('input', () => DibujarMarcaAgua());

botonGrabar.addEventListener('click', GrabarImagen);

activarClickConTeclado(Resetear, () => {
	ResetearControles();
	RedibujarDNI();
	AjustarVisibilidadResetear();
});

activarClickConTeclado(document.getElementById('cerrar'), () => DesactivarModoEdicion());

// desactivar modo edición al pulsar Esc
document.body.addEventListener('keydown', e => {
	if (e.key == 'Escape') {
		// si hay un popover abierto dejamos que lo procese de forma normal
		if (document.querySelector(':popover-open'))
			return;

		DesactivarModoEdicion();
	}
});

configurarGiro();
configurarEditorEsquinas();
configurarCompartir();
configurarDD(document.body);
initGestures();
AsignarWatermarkPorDefecto(Watermark);

// detectar si se ha cargado la página con un hash y abrir ese details
const hash = document.location.hash;
if (hash) {
	const info = document.querySelector(hash);
	if (info && typeof info.open != 'undefined') {
		info.open = true;
		info.firstElementChild.focus();
	}
}

// Generar enlaces visibles en los ids
querySelector_Array('#FAQ details[id]')
	.forEach(elmto => {
		elmto.addEventListener('click', () => {
			if (elmto.open)
				history.replaceState(null, '', ' ')
			else
				history.replaceState(null, '', '#' + elmto.id)
		});
	});

// Si el navegador soporta el Popover API, mostraremos la información de ayuda como tooltips sin salir del modo edición
const soportaPopover = HTMLElement.prototype.hasOwnProperty('popover');

// Abrir información de ayuda al pulsar el enlace
querySelector_Array('.AbrirInfo')
	.forEach(elmto => {
		// popover para los enlaces dentro de la zona de edición
		if (soportaPopover && elmto.closest('#pasos')) {
			// clonamos el contenido que queremos mostrar para seguir dentro del modo edición
			const respuesta = document.querySelector(elmto.getAttribute('href') + ' .respuesta');
			const popover = respuesta.cloneNode(true);
			popover.classList.remove('respuesta');
			popover.popover = 'auto';
			elmto.parentNode.appendChild(popover);
			elmto.popoverTargetElement = popover;
		}

		activarClickConTeclado(elmto, (target, ev) => {
			const popover = elmto.popoverTargetElement;
			// si hemos preparado el popover lo mostramos en vez de mostrar la respuesta en la parte inferior
			if (popover) {
				// no funciona bien, para cuando llegamos aquí el popover ya se ha cerrado por lo que se vuelve a mostrar
				if (popover.matches(':popover-open'))
					popover.hidePopover();
				else
					popover.showPopover();

				// lo ponemos por debajo
				const bb = target.getBoundingClientRect();
				popover.style.top = (bb.y + bb.height + 10) + 'px';

				ev.preventDefault();
				return;
			}

			// navegadores antiguos
			DesactivarModoEdicion();
			const info = document.querySelector(target.getAttribute('href'));
			info.open = true;
			setTimeout(() => {
				info.scrollIntoView({ behavior: 'smooth' });
				info.firstElementChild.focus();
			}, 500);
			// que no cambie el hash de la página
			ev.preventDefault();
		});
	});
