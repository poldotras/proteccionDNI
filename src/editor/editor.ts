/**
 * Flujo principal del editor: carga de la foto, preparación del DNI y el
 * cableado de todos los eventos de la página. Es el punto de entrada del editor.
 */
import '../estilos.css';
import { Formato, SelectorFichero, Watermark, EnmascararDni, DivMascaraDni, Validez, DivValidez, botonGuardar } from './dom';
import { estado } from './estado';
import { enviarAlWorker } from './procesador';
import {
	RectanguloAEsquinas,
	EsquinasPorDefecto,
	DibujarEditorEsquinas,
	AplicarEsquinas,
	MostrarBotonDeteccion,
	ReiniciarEnderezado,
	configurarGiro,
	configurarDeteccionManual,
	configurarEditorEsquinas,
} from './esquinas';
import { RedibujarDNI, DibujarMascara } from './resultado';
import { DibujarMarcaAgua, AsignarWatermarkPorDefecto, SortearMarcas } from './marcaAgua';
import { GrabarImagen, configurarCompartir } from './guardar';
import { FormatosDnis } from '../formatos';
import type { RespuestaProcesar } from '../tipos';

window.onerror = (mensaje, _fuente, _linea, _columna, error) => {
	console.error('Error inesperado:', mensaje, error);
	alert(`Error inesperado: ${mensaje}`);
};

//
// Carga de la foto
//

/** Redibujar las capas de censura y de marca de agua sobre el resultado */
function RedibujarCapas(): void {
	DibujarMascara();
	DibujarMarcaAgua();
}

/**
 * Comenzar la edición con una imagen ya cargada: mostrar la zona de edición,
 * sortear las marcas y preparar el DNI. Se usa al elegir una foto y también
 * desde la galería de la página de pruebas
 */
export function ComenzarEdicion(img: HTMLImageElement): void {
	document.getElementById('Edicion')!.classList.remove('Oculto');
	// marcar una foto nueva: descarta respuestas en vuelo de la anterior
	estado.generacion++;
	ReiniciarEnderezado();
	estado.tarjetaResultado = null;
	SortearMarcas();

	PrepararDNI(img)
		.then(() => RedibujarDNI())
		.catch(error => {
			alert('Error preparando DNI \r\n' + error);
			console.error(error);
		});

	RedibujarCapas();
}

/** Cargar el fichero elegido como imagen y comenzar el proceso */
function MostrarImagen(file: File): void {
	const img = new Image();
	img.onload = function () {
		URL.revokeObjectURL(img.src);
		ComenzarEdicion(img);
	};
	img.onerror = function (e) {
		URL.revokeObjectURL(img.src);
		console.error('No se ha podido cargar la imagen', e);
		alert('Por favor, escoge una imagen válida');
	};
	img.src = URL.createObjectURL(file);
}

/**
 * Crear el ImageBitmap que se envía al WebWorker.
 * Con algunas fotos (los móviles actuales generan imágenes enormes) createImageBitmap
 * falla con "The ImageBitmap could not be allocated"; en ese caso reducimos la foto
 * pasándola por un canvas. No se pierde calidad: el worker trabaja a 2000px como máximo.
 */
function CrearBitmap(img: HTMLImageElement): Promise<ImageBitmap> {
	return createImageBitmap(img)
		.catch(function () {
			const escala = Math.min(1, 2000 / img.naturalWidth, 2000 / img.naturalHeight);
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
			canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
			canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
			return createImageBitmap(canvas);
		});
}

/**
 * Tomamos la imagen original del DNI y la preparamos a blanco y negro,
 * detectando las esquinas de la tarjeta y enderezándola si es posible.
 */
function PrepararDNI(img: HTMLImageElement): Promise<void> {
	const generacion = estado.generacion;
	return CrearBitmap(img)
		// el bitmap se transfiere al worker (no lo necesitamos ya en el hilo principal)
		.then(bitmap => enviarAlWorker<RespuestaProcesar>({ tipo: 'procesar', bitmap }, [bitmap]))
		.then(function (respuesta) {
			// descartar la respuesta si entretanto se ha cargado otra foto
			if (generacion !== estado.generacion)
				return;
			estado.imagenOriginalBN = respuesta.bitmap;
			// el editor de esquinas muestra la foto en color; si no está disponible, la de blanco y negro
			estado.imagenOriginalColor = respuesta.bitmapColor || respuesta.bitmap;
			estado.imagenDNI_BN = respuesta.bitmap;

			if (respuesta.esquinas)
				estado.esquinasDNI = respuesta.esquinas;
			else if (respuesta.tarjeta)
				estado.esquinasDNI = RectanguloAEsquinas(respuesta.tarjeta);
			else
				estado.esquinasDNI = EsquinasPorDefecto();

			DibujarEditorEsquinas();

			// con una foto ya recortada a la tarjeta se ofrece buscar el DNI dentro
			MostrarBotonDeteccion(!!respuesta.recortada);

			// si la detección de esquinas es fiable, enderezar la tarjeta directamente
			if (respuesta.esquinas)
				return AplicarEsquinas();

			estado.tarjetaResultado = respuesta.tarjeta;
			return;
		});
}

/** Permitir arrastrar y soltar una foto sobre la página */
function configurarDD(root: HTMLElement): void {
	root.addEventListener('dragenter', function (event) {
		if (!hasFiles(event))
			return;

		root.classList.add('dragover');
		event.dataTransfer!.dropEffect = 'copy';
	}, false);

	root.addEventListener('dragleave', function (event) {
		if (!event.dataTransfer)
			return;

		if (event.target != root && event.srcElement != root)
			return;

		root.classList.remove('dragover');
	}, false);

	root.addEventListener('dragover', function (event) {
		if (!hasFiles(event))
			return;

		event.dataTransfer!.dropEffect = 'copy';
		// evitamos que al soltar lo procese el navegador
		event.preventDefault();
	}, false);

	root.addEventListener('drop', function (event) {
		event.preventDefault();
		const dataTransfer = event.dataTransfer;
		if (!dataTransfer)
			return;

		root.classList.remove('dragover');

		// si se suelta algo que no es un fichero (texto, un enlace...) no hay nada que cargar
		const fichero = dataTransfer.files[0];
		if (!fichero)
			return;
		MostrarImagen(fichero);
		estado.nombreFichero = fichero.name;
	}, false);
}

function hasFiles(ev: DragEvent): boolean {
	const data = ev.dataTransfer;
	return !!data && !!data.types && Array.prototype.includes.call(data.types, 'Files');
}

//
// Inicialización
//

// Rellenar la lista de formatos de DNI automáticamente
Formato.innerHTML = Object.entries(FormatosDnis)
	.map(([clave, formato]) => `<option value='${clave}'>${formato.Nombre}</option>`)
	.join('');

SelectorFichero.addEventListener('change', function () {
	const fichero = SelectorFichero.files?.[0];
	if (fichero) {
		MostrarImagen(fichero);
		estado.nombreFichero = SelectorFichero.value;
		// borramos por si quieren volver a elegir la misma
		SelectorFichero.value = '';
	}
});

// botón "bonito" para el usuario
document.getElementById('ZonaElegir')!
	.addEventListener('click', () => SelectorFichero.click());

Formato.addEventListener('change', function () {
	// ajustar la visibilidad de los checkbox según las opciones del formato elegido
	const formato = FormatosDnis[Formato.value];
	DivMascaraDni.classList.toggle('Oculto', !formato.MascarasDni);
	DivValidez.classList.toggle('Oculto', !formato.DatosValidez);
	RedibujarCapas();
});

[EnmascararDni, Validez].forEach(control =>
	control.addEventListener('change', RedibujarCapas));

Watermark.addEventListener('input', function () {
	SortearMarcas();
	DibujarMarcaAgua();
});

botonGuardar.addEventListener('click', GrabarImagen);

configurarGiro();
configurarDeteccionManual();
configurarEditorEsquinas();
configurarCompartir();
configurarDD(document.body);
AsignarWatermarkPorDefecto(Watermark);

// Enlaces de ayuda: si el navegador soporta el Popover API, la respuesta se muestra
// sin salir de la página; si no, el propio enlace lleva a la pregunta en la portada
if (Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover')) {
	document.querySelectorAll<HTMLElement>('.AbrirInfo[data-ayuda]')
		.forEach(elmto => {
			const respuesta = document.querySelector('#' + elmto.dataset.ayuda + ' .respuesta');
			if (!respuesta)
				return;

			// clonamos el contenido para mostrarlo como popover bajo el enlace
			const popover = respuesta.cloneNode(true) as HTMLElement;
			popover.classList.remove('respuesta');
			popover.popover = 'auto';
			elmto.parentNode!.appendChild(popover);
			(elmto as HTMLButtonElement).popoverTargetElement = popover;

			elmto.addEventListener('click', ev => {
				// para cuando llegamos aquí el popover ya se ha cerrado por lo que se vuelve a mostrar
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
