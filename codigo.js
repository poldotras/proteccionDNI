'use strict';

window.onerror = (a, b, c, d, e) => {
	console.log(`Error message: ${a}`, `lineno: ${c}`, `colno: ${d}`);
	console.error(e);

	alert(`Error inesperado: ${a}`)
};

//////////////////////////////////////
//
// Referencias a los elementos de la página
//
//////////////////////////////////////

const Previsualizacion = document.getElementById('Previsualizacion');
// canvas donde dibujamos el DNI enderezado con los ajustes de posición
const canvas = document.getElementById('canvas');

// canvas del editor de esquinas con la imagen original y sus elementos
const canvasOriginal = document.getElementById('canvasOriginal');
const MarcoEsquinas = document.getElementById('MarcoEsquinas');
const PoligonoEsquinas = document.getElementById('PoligonoEsquinas');
const Lupa = document.getElementById('Lupa');

const SelectorFichero = document.getElementById('SelectorFichero');
const Formato = document.getElementById('Formato');
const Watermark = document.getElementById('Watermark');
const EnmascararDni = document.getElementById('EnmascararDni');
const DivMascaraDni = document.getElementById('DivMascaraDni');
const Validez = document.getElementById('Validez');
const DivValidez = document.getElementById('DivValidez');
const botonGrabar = document.getElementById('Guardar');
const Resetear = document.getElementById('Resetear');

// controles ocultos que guardan los ajustes de posición del resultado;
// se modifican con los gestos táctiles y el encuadre automático
const Rotacion = document.getElementById('Rotacion');
const Horizontal = document.getElementById('Horizontal');
const Vertical = document.getElementById('Vertical');
const Zoom = document.getElementById('Zoom');

// canvas con las máscaras que tapan datos
const canvasMascara = document.createElement('canvas');
// canvas para la superposición de texto/marca de agua
const canvasWatermark = document.createElement('canvas');
// canvas para generar la imagen a descargar
const canvaComposicion = document.createElement('canvas');

[canvasMascara, canvasWatermark, canvaComposicion].forEach(function (capa) {
	capa.width = canvas.width;
	capa.height = canvas.height;
});
Previsualizacion.appendChild(canvasMascara);
Previsualizacion.appendChild(canvasWatermark);

//////////////////////////////////////
//
// Estado global
//
//////////////////////////////////////

// Imagen del DNI a escala 1:1 y en blanco y negro que se muestra como resultado.
// Si se ha aplicado la corrección de perspectiva, contiene ya la imagen enderezada
let imagenDNI_BN = null;

// Imagen original en blanco y negro sin enderezar, la que se muestra en el editor de esquinas
let imagenOriginalBN = null;

// Las 4 esquinas del DNI sobre la imagen original, en orden: sup-izda, sup-dcha, inf-dcha, inf-izda
let esquinasDNI = null;

// Nombre del fichero elegido, para generar el nombre de la copia protegida
let nombreFichero = '';

// Valores de Zoom y desplazamiento calculados al encuadrar automáticamente el DNI en el recuadro
let posicionAutomatica = null;

// Límites por defecto de los controles de posición, para restaurarlos con cada foto nueva
const RangosPorDefecto = [Zoom, Horizontal, Vertical].map(control => ({ control, min: control.min, max: control.max }));

// escala y desplazamiento con los que se muestra la imagen original dentro del editor de esquinas
let transformacionEditor = { escala: 1, x: 0, y: 0 };

// WebWorker que procesa la imagen (blanco y negro, detección de esquinas, enderezado)
let procesadorDNI = CrearProcesador();

// Comunicación con el worker: cada petición lleva un id para resolver su promesa al responder
let idMensajeWorker = 0;
const respuestasWorker = new Map();
let workerEscuchado = null;

// Control para no acumular peticiones de enderezado mientras se arrastran las esquinas
let enderezadoEnCurso = false;
let enderezadoPendiente = false;

// Saber si tenemos pendiente un redibujo del DNI para no saturar la CPU/GPU
let redibujoDNIpendiente = false;

// Objeto para mantener caché de las métricas del texto sin recalcular
const CacheMetricas = {};

// Estado de los gestos táctiles (pellizco para zoom/rotación y arrastre para desplazar)
const evCache = [];
let distanciaInicial;
let zoomInicial;
let anguloInicial;
let rotacionInicial;
let puntoInicial;
let desplazamientoInicial;
// escala con la que se está mostrando el canvas en pantalla, para convertir desplazamientos
let escalaImagen;

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
// Comunicación con el WebWorker
//
//////////////////////////////////////

/**
Crea el WebWorker que procesa la imagen (blanco y negro, detección de esquinas, enderezado)
*/
function CrearProcesador() {
	if (!window.Worker) {
		alert('El navegador no soporta WebWorkers');
		return null;
	}

	// Al usar la página como fichero, el meta CSP
	if (document.location.protocol == 'file:') {
		const metaCsp = document.getElementById('MetaCSP');
		if (metaCsp) {
			alert('Para poder ejecutar el programa desde tu ordenador necesitas eliminar la cabecera marcada como <meta id="MetaCSP"...>\r\n' +
				'Se trata de una protección adicional para el servidor web, pero en local el navegador está aplicando otras restricciones que no son compatibles.\r\n' +
				'Si no la eliminas, tendrás errores a continuación, o puede que no se muestre ningún error pero no veas tampoco la imagen de tu DNI (Firefox).');
			return null;
		}

		// al trabajar con file: no deja crear un worker usando un fichero externo, así que lo apañamos...
		// https://github.com/AlfonsoML/proteccionDNI/issues/18
		const script = document.createElement('script');
		script.src = 'worker.js';
		script.type = 'application/javascript';
		document.body.appendChild(script);

		return null;
	}

	try {
		return new Worker('worker.js');
	} catch (e) {
		console.log(e);
		alert('Error creando WebWorker\r\n' + e);
		return null;
	}
}

/**
Envía un mensaje al worker y devuelve una promesa que se resuelve con su respuesta
*/
function EnviarAlWorker(mensaje) {
	return new Promise(function (resolve, reject) {
		if (!procesadorDNI) {
			reject('No existe el objeto procesadorDNI');
			return;
		}

		// el worker se puede crear en diferido al usar file:, así que nos suscribimos al hacer la primera petición
		if (workerEscuchado != procesadorDNI) {
			procesadorDNI.addEventListener('message', function (e) {
				const resolver = respuestasWorker.get(e.data.id);
				respuestasWorker.delete(e.data.id);
				if (resolver)
					resolver(e.data);
			});
			workerEscuchado = procesadorDNI;
		}

		const id = ++idMensajeWorker;
		respuestasWorker.set(id, resolve);
		mensaje.id = id;
		procesadorDNI.postMessage(mensaje);
	});
}

//////////////////////////////////////
//
// Procesado del DNI: preparar, enderezar y girar
//
//////////////////////////////////////

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
Pide al worker enderezar la imagen con las esquinas actuales y actualiza la previsualización
*/
function AplicarEsquinas() {
	return EnviarAlWorker({ esquinas: esquinasDNI })
		.then(function (respuesta) {
			// el worker devuelve null si las esquinas no permiten calcular la transformación
			if (!respuesta.bitmap)
				return;

			imagenDNI_BN = respuesta.bitmap;
			AjustarPosicionAutomatica(respuesta.tarjeta);
			RedibujarDNI();
		});
}

/**
Enderezar la imagen con las esquinas actuales, sin acumular peticiones si llegan más
mientras el worker está ocupado (por ejemplo al arrastrar una esquina rápidamente)
*/
function SolicitarEnderezado() {
	if (!esquinasDNI || !EsConvexo(esquinasDNI))
		return;

	if (enderezadoEnCurso) {
		enderezadoPendiente = true;
		return;
	}

	enderezadoEnCurso = true;
	AplicarEsquinas()
		.catch(error => console.error(error))
		.finally(function () {
			enderezadoEnCurso = false;
			if (enderezadoPendiente) {
				enderezadoPendiente = false;
				SolicitarEnderezado();
			}
		});
}

/**
Giros de 90º de la imagen original
*/
function configurarGiro() {
	querySelector_Array('.girar')
		.forEach(boton => boton.addEventListener('click', girarDNI));
}

function girarDNI(ev) {
	const giro = parseInt(ev.currentTarget.dataset.giro, 10);

	EnviarAlWorker({ girar: giro })
		.then(function (respuesta) {
			if (!respuesta.bitmap)
				return;

			const anchoPrevio = imagenOriginalBN.width;
			const altoPrevio = imagenOriginalBN.height;
			imagenOriginalBN = respuesta.bitmap;

			// girar también las esquinas, desplazando su orden para que
			// el punto 0 siga siendo el de arriba a la izquierda
			const giradas = esquinasDNI.map(p => giro > 0
				? { x: altoPrevio - p.y, y: p.x }
				: { x: p.y, y: anchoPrevio - p.x });
			esquinasDNI = giro > 0
				? [giradas[3], giradas[0], giradas[1], giradas[2]]
				: [giradas[1], giradas[2], giradas[3], giradas[0]];

			DibujarEditorEsquinas();
			SolicitarEnderezado();
		})
		.catch(error => console.error(error));
}

//////////////////////////////////////
//
// Encuadre automático del resultado
//
//////////////////////////////////////

/**
Ajusta el zoom y los desplazamientos para encuadrar el DNI detectado en el recuadro de previsualización.
Si no se ha podido detectar la tarjeta, aplica el ajuste básico de escalado por anchura.
*/
function AjustarPosicionAutomatica(tarjeta) {
	posicionAutomatica = null;
	RangosPorDefecto.forEach(rango => {
		rango.control.min = rango.min;
		rango.control.max = rango.max;
	});

	if (tarjeta) {
		// escala para que la zona detectada llene el canvas sin márgenes,
		// de forma que las máscaras de censura caigan donde corresponde;
		// el control de Zoom se aplica sobre la anchura del canvas
		// (se redondea lo justo para que los valores sobrevivan el paso por los inputs de rango)
		const zoom = Math.round(Math.min(canvas.width / tarjeta.w, canvas.height / tarjeta.h) * imagenDNI_BN.width / canvas.width * 10000) / 10000;
		const escala = zoom * canvas.width / imagenDNI_BN.width;

		posicionAutomatica = {
			zoom,
			horizontal: Math.round((canvas.width - tarjeta.w * escala) / 2 - tarjeta.x * escala),
			vertical: Math.round((canvas.height - tarjeta.h * escala) / 2 - tarjeta.y * escala),
		};
	} else {
		// Vamos a intentar calcular si puede interesar hacer zoom y desplazar
		const altoEscalado = canvas.width * imagenDNI_BN.height / imagenDNI_BN.width;

		if (altoEscalado < canvas.height) {
			const zoom = Math.min(parseFloat(Zoom.max), Math.round(canvas.height / altoEscalado * 1000) / 1000);
			posicionAutomatica = {
				zoom,
				horizontal: Math.round((canvas.width - canvas.width * zoom) / 2),
				vertical: 0,
			};
		}
	}

	if (posicionAutomatica) {
		AsignarValorAmpliandoRango(Zoom, posicionAutomatica.zoom);
		AsignarValorAmpliandoRango(Horizontal, posicionAutomatica.horizontal);
		AsignarValorAmpliandoRango(Vertical, posicionAutomatica.vertical);
	}
}

/**
Asigna un valor a un control de rango ampliando sus límites si hace falta,
dejando holgura para que se pueda seguir ajustando a mano en ambas direcciones
*/
function AsignarValorAmpliandoRango(input, valor) {
	const holgura = (parseFloat(input.max) - parseFloat(input.min)) / 4;
	if (valor < parseFloat(input.min))
		input.min = valor - holgura;
	if (valor > parseFloat(input.max))
		input.max = valor + holgura;

	input.value = valor;
}

/**
Valor inicial de un control de posición, teniendo en cuenta el encuadre automático
*/
function ValorInicial(control) {
	if (posicionAutomatica) {
		switch (control) {
			case Zoom:
				return posicionAutomatica.zoom;
			case Horizontal:
				return posicionAutomatica.horizontal;
			case Vertical:
				return posicionAutomatica.vertical;
		}
	}
	return control.defaultValue;
}

/**
Vuelve a poner los controles de posición con los valores iniciales
*/
function ResetearControles() {
	[Rotacion, Horizontal, Vertical, Zoom].forEach(function (control) {
		control.value = ValorInicial(control);
	});
}

/**
El botón de deshacer solo se muestra cuando la posición difiere del encuadre automático
*/
function AjustarVisibilidadResetear() {
	const movido = [Rotacion, Horizontal, Vertical, Zoom]
		.some(control => control.value != ValorInicial(control));

	Resetear.style.display = movido ? '' : 'none';
}

//////////////////////////////////////
//
// Editor de esquinas sobre la imagen original
//
//////////////////////////////////////

function RectanguloAEsquinas(rect) {
	return [
		{ x: rect.x, y: rect.y },
		{ x: rect.x + rect.w, y: rect.y },
		{ x: rect.x + rect.w, y: rect.y + rect.h },
		{ x: rect.x, y: rect.y + rect.h },
	];
}

function EsquinasPorDefecto() {
	const w = imagenOriginalBN.width;
	const h = imagenOriginalBN.height;
	return RectanguloAEsquinas({ x: w * 0.05, y: h * 0.05, w: w * 0.9, h: h * 0.9 });
}

/**
Comprueba que las 4 esquinas forman un cuadrilátero convexo en el orden esperado (sentido horario)
*/
function EsConvexo(esquinas) {
	for (let i = 0; i < 4; i++) {
		const a = esquinas[i];
		const b = esquinas[(i + 1) % 4];
		const c = esquinas[(i + 2) % 4];
		if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0)
			return false;
	}
	return true;
}

/**
Dibujar la imagen original en el editor y colocar el marco con las 4 esquinas
*/
function DibujarEditorEsquinas() {
	if (!imagenOriginalBN || !esquinasDNI)
		return;

	const ctx = canvasOriginal.getContext('2d', { alpha: false });
	ctx.fillStyle = 'white';
	ctx.fillRect(0, 0, canvasOriginal.width, canvasOriginal.height);

	const escala = Math.min(canvasOriginal.width / imagenOriginalBN.width, canvasOriginal.height / imagenOriginalBN.height);
	transformacionEditor = {
		escala,
		x: (canvasOriginal.width - imagenOriginalBN.width * escala) / 2,
		y: (canvasOriginal.height - imagenOriginalBN.height * escala) / 2,
	};
	ctx.drawImage(imagenOriginalBN, transformacionEditor.x, transformacionEditor.y, imagenOriginalBN.width * escala, imagenOriginalBN.height * escala);

	ActualizarMarcoEsquinas();
}

/**
Pasa un punto de coordenadas de la imagen original a coordenadas del canvas del editor
*/
function EsquinaAEditor(punto) {
	return {
		x: transformacionEditor.x + punto.x * transformacionEditor.escala,
		y: transformacionEditor.y + punto.y * transformacionEditor.escala,
	};
}

/**
Actualizar el polígono y los puntos arrastrables con la posición actual de las esquinas
*/
function ActualizarMarcoEsquinas() {
	const puntos = esquinasDNI.map(EsquinaAEditor);
	PoligonoEsquinas.setAttribute('points', puntos.map(p => p.x + ',' + p.y).join(' '));
	PoligonoEsquinas.classList.toggle('invalido', !EsConvexo(esquinasDNI));

	// se posicionan tanto los círculos visibles como sus zonas de toque ampliadas
	querySelector_Array('.esquina', MarcoEsquinas)
		.forEach(function (circulo) {
			const punto = puntos[circulo.dataset.indice];
			circulo.setAttribute('cx', punto.x);
			circulo.setAttribute('cy', punto.y);
		});
}

/**
Permitir arrastrar las 4 esquinas con ratón o dedo; al soltar se endereza la imagen.
Mientras se arrastra se muestra una lupa para colocar el punto con precisión.
*/
function configurarEditorEsquinas() {
	let indiceArrastre = null;

	MarcoEsquinas.addEventListener('pointerdown', function (ev) {
		const esquina = ev.target.closest('.esquina');
		if (!esquina || !esquinasDNI)
			return;

		indiceArrastre = parseInt(esquina.dataset.indice, 10);
		MarcoEsquinas.setPointerCapture(ev.pointerId);
		Lupa.style.display = 'block';
		ActualizarLupa(indiceArrastre);
		ev.stopPropagation();
		ev.preventDefault();
	});

	MarcoEsquinas.addEventListener('pointermove', function (ev) {
		if (indiceArrastre == null)
			return;

		// pasar de coordenadas de pantalla a coordenadas de la imagen original
		const bb = MarcoEsquinas.getBoundingClientRect();
		const x = (ev.clientX - bb.left) * canvasOriginal.width / bb.width;
		const y = (ev.clientY - bb.top) * canvasOriginal.height / bb.height;

		esquinasDNI[indiceArrastre] = {
			x: Math.min(Math.max((x - transformacionEditor.x) / transformacionEditor.escala, 0), imagenOriginalBN.width),
			y: Math.min(Math.max((y - transformacionEditor.y) / transformacionEditor.escala, 0), imagenOriginalBN.height),
		};
		ActualizarMarcoEsquinas();
		ActualizarLupa(indiceArrastre);
		ev.stopPropagation();
	});

	function soltar(ev) {
		if (indiceArrastre == null)
			return;

		indiceArrastre = null;
		Lupa.style.display = '';
		SolicitarEnderezado();
		ev.stopPropagation();
	}
	MarcoEsquinas.addEventListener('pointerup', soltar);
	MarcoEsquinas.addEventListener('pointercancel', soltar);
}

/**
Dibujar en la lupa la zona ampliada alrededor de la esquina que se está arrastrando,
con una cruz en el centro y las líneas del marco hacia las esquinas vecinas,
y colocarla junto al punto sin taparlo ni salirse del editor
*/
function ActualizarLupa(indice) {
	const punto = esquinasDNI[indice];
	const centro = Lupa.width / 2;

	// zona de la imagen original que se amplía, proporcional a su tamaño
	const lado = Math.max(80, Math.round(imagenOriginalBN.width * 0.08));
	const ampliacion = Lupa.width / lado;

	const ctx = Lupa.getContext('2d', { alpha: false });
	ctx.fillStyle = 'white';
	ctx.fillRect(0, 0, Lupa.width, Lupa.height);
	ctx.drawImage(imagenOriginalBN, punto.x - lado / 2, punto.y - lado / 2, lado, lado, 0, 0, Lupa.width, Lupa.height);

	// líneas del marco hacia las dos esquinas vecinas, para poder alinear con los bordes
	ctx.strokeStyle = 'rgb(13 110 253 / .8)';
	ctx.lineWidth = 3;
	[1, 3].forEach(function (salto) {
		const vecino = esquinasDNI[(indice + salto) % 4];
		ctx.beginPath();
		ctx.moveTo(centro, centro);
		ctx.lineTo(centro + (vecino.x - punto.x) * ampliacion, centro + (vecino.y - punto.y) * ampliacion);
		ctx.stroke();
	});

	// cruz de precisión en el centro
	ctx.strokeStyle = '#DC1E1E';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(centro - 22, centro);
	ctx.lineTo(centro - 6, centro);
	ctx.moveTo(centro + 6, centro);
	ctx.lineTo(centro + 22, centro);
	ctx.moveTo(centro, centro - 22);
	ctx.lineTo(centro, centro - 6);
	ctx.moveTo(centro, centro + 6);
	ctx.lineTo(centro, centro + 22);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(centro, centro, 6, 0, 2 * Math.PI);
	ctx.stroke();

	// colocar la lupa por encima del punto (o por debajo si no cabe), sin salirse del editor
	const anchoPct = 30; // debe coincidir con la anchura definida en el CSS
	const altoPct = anchoPct * canvasOriginal.width / canvasOriginal.height;
	const pe = EsquinaAEditor(punto);

	let izquierda = pe.x / canvasOriginal.width * 100 - anchoPct / 2;
	izquierda = Math.min(Math.max(izquierda, 0), 100 - anchoPct);

	let arriba = pe.y / canvasOriginal.height * 100 - altoPct - 8;
	if (arriba < 0)
		arriba = pe.y / canvasOriginal.height * 100 + 12;

	Lupa.style.left = izquierda + '%';
	Lupa.style.top = arriba + '%';
}

//////////////////////////////////////
//
// Copia protegida: redibujado, máscaras y marca de agua
//
//////////////////////////////////////

function RedibujarDNI() {
	if (imagenDNI_BN == null)
		return;

	if (redibujoDNIpendiente)
		return;

	redibujoDNIpendiente = true;
	requestAnimationFrame(RedibujarDNIEnRAF);
}

/**
Función que vamos a llamar con un throttle de requestAnimationFrame, colapsando multiples llamadas consecutivas.
Se encarga de dibujar la copia que tenemos en BN del DNI ajustando posición y ángulo
*/
function RedibujarDNIEnRAF() {
	redibujoDNIpendiente = false;

	let canvasOrigen = imagenDNI_BN;

	// pequeños ajustes de ángulo
	const grados = Rotacion.value;
	if (grados != 0) {
		const canvasAjusteAngulo = new OffscreenCanvas(canvasOrigen.width, canvasOrigen.height);

		const ctxRotado = canvasAjusteAngulo.getContext('2d');
		ctxRotado.save();
		ctxRotado.translate(canvasAjusteAngulo.width / 2, canvasAjusteAngulo.height / 2);
		ctxRotado.rotate(grados * Math.PI / 180);
		ctxRotado.drawImage(canvasOrigen, - canvasOrigen.width / 2, - canvasOrigen.height / 2);
		ctxRotado.restore();

		canvasOrigen = canvasAjusteAngulo;
	}

	const ctx = canvas.getContext('2d', { alpha: false });

	// Borrar
	ctx.rect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'white';
	ctx.fill();

	// volcar Imagen DNI escalada y con desplazamiento
	const aspectRatio = canvasOrigen.height / canvasOrigen.width;
	ctx.drawImage(canvasOrigen, Horizontal.value, Vertical.value, canvas.width * Zoom.value, canvas.width * Zoom.value * aspectRatio);
}

/** Ocultar las partes de la imagen que no hacen ninguna falta, dependerá del formato de DNI y el lado */
function DibujarMascara() {
	function DibujarRectangulo(bloque) {
		ctx.beginPath();
		ctx.roundRect(bloque.x, bloque.y, bloque.w, bloque.h, 5);
		ctx.fill();
	}
	const DatosFormato = FormatosDnis[Formato.value];

	const ctx = canvasMascara.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'black';
	DatosFormato.Mascaras.forEach(DibujarRectangulo);

	if (Validez.checked)
		DatosFormato.DatosValidez.forEach(DibujarRectangulo);

	if (EnmascararDni.checked && DatosFormato.MascarasDni) {
		const bloquesDni = DatosFormato.MascarasDni;
		ctx.fillStyle = 'white';
		bloquesDni.forEach(DibujarRectangulo);

		let bloque = bloquesDni[0]
		if (bloque.h == 50)
			ctx.font = '74px sans-serif';
		else
			ctx.font = '82px sans-serif';
		ctx.fillStyle = 'black';
		ctx.fillText('***', bloque.x, bloque.y + bloque.h + 20);
		bloque = bloquesDni[1]
		ctx.fillText('**', bloque.x, bloque.y + bloque.h + 20);
	}
}

/**
Sobre escribir texto en las zonas que se definan para el formato elegido
*/
function DibujarMarcaAgua() {
	const ctx = canvasWatermark.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	const texto = Watermark.value;
	// Si ha borrado todo el texto, no escribir nada
	if (!texto)
		return;

	FormatosDnis[Formato.value].Watermarks.forEach(marca => {
		RellenarTexto(texto, ctx, marca.fuente, marca.estilo, marca.bb.x, marca.bb.y, marca.bb.w, marca.bb.h);
	});
}

/**
Poner el texto de la marca de agua por defecto, con la fecha actual y el parámetro "para" si existe
*/
function AsignarWatermarkPorDefecto(input) {
	const hoy = new Date();
	const sp = new URLSearchParams(location.search)
	const sufijo = sp.has('para') ? sp.get('para') : '…';
	input.value = `Copia ${hoy.toISOString().substring(0, 10)} para ${sufijo}`;
}

/**
Escribir un texto en la zona delimitada haciendo wrap letra a letra y repitiendo hasta llenar
*/
function RellenarTexto(texto, ctx, fuente, estilo, x, y, maxWidth, maxHeight) {
	ctx.font = fuente;
	ctx.fillStyle = estilo;

	// Calcular altura de linea con la fuente actual
	const metrics = ctx.measureText('A');
	const lineHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
	const yMax = y + maxHeight - lineHeight;

	// Dividir el texto en letras (con un separador final para repeticiones)
	const letras = (texto + ' - ').split('');

	// Obtenemos las metricas de anchura cacheada o creamos un objeto nuevo
	const key = fuente + estilo;
	let Metricas = CacheMetricas[key];
	if (!Metricas) {
		Metricas = {};
		CacheMetricas[key] = Metricas;
	}
	// validamos que todas las letras están en nuestra caché o las añadimos
	letras.forEach(letra => {
		if (Metricas[letra])
			return;
		Metricas[letra] = ctx.measureText(letra).width;
	});

	let line = ''; // Linea que vamos a escribir

	// bucle hasta rellenar toda la zona, vamos letra a letra
	let n = 0;
	let ancho = 0;
	while (true) {
		const letra = letras[n];
		// Medir la anchura que tendrá si añadimos esta letra
		const anchoLetra = Metricas[letra];
		const testWidth = ancho + anchoLetra;
		// If the width of this test line is more than the max width
		if (testWidth > maxWidth && n > 0) {
			// escribir el texto
			ctx.fillText(line, x, y);
			// Nos movemos abajo según la altura calculada
			y += lineHeight;
			// cuando superemos el límite vertical paramos
			if (y >= yMax)
				return;

			// Comenzamos una linea nueva con esta letra
			line = letra;
			ancho = 0;
		} else {
			// Si no hemos superado la anchura, la añadimos a la linea actual
			line += letra;
			ancho += anchoLetra;
		}
		// cuando llegamos al final, reseteamos para volver
		if (n === letras.length - 1)
			n = 0;
		else
			n++;
	}
}

//////////////////////////////////////
//
// Guardar y compartir
//
//////////////////////////////////////

/**
Combinar los 3 canvas parciales en una sola imagen para descarga canvaComposicion
*/
function ComponerImagen() {
	const ctx = canvaComposicion.getContext('2d');
	ctx.drawImage(canvas, 0, 0);
	ctx.drawImage(canvasMascara, 0, 0);
	ctx.drawImage(canvasWatermark, 0, 0);
}

/**
Toma el nombre de fichero actual y lo devuelve añadiendo el sufijo ' - protegido.jpg'
*/
function GenerarNombreFichero() {
	const match = nombreFichero.match(/([^\/\\]+)(?=\.[^\.]+$)/)
	if (match)
		return match[1] + ' - protegido.jpg'

	return 'protegido.jpg';
}

function GrabarImagen() {
	ComponerImagen();

	const link = document.getElementById('grabar');
	link.download = GenerarNombreFichero();
	try {
		link.href = canvaComposicion.toDataURL('image/jpeg', 0.8);
		link.click();
	} catch (e) {
		alert('No se ha podido generar la imagen\r\n' + e);
	}
	DesactivarModoEdicion();
}

/**
Activar el botón de compartir si el navegador soporta compartir ficheros (Firefox no lo tiene implementado)
*/
function configurarCompartir() {
	const btnCompartir = document.getElementById('Compartir');

	if (typeof navigator.share == 'undefined' || !navigator.canShare({
		title: 'Copia de mi DNI',
		files: [new File([''], 'test.jpg', { type: 'image/jpeg' })],
	})) {
		btnCompartir.remove();
		return;
	}

	btnCompartir.addEventListener('click', async () => {
		ComponerImagen();

		let dataUrl;
		try {
			dataUrl = canvaComposicion.toDataURL('image/jpeg', 0.8);
		} catch (e) {
			alert('No se ha podido generar la imagen\r\n' + e);
		}

		let blob;
		try {
			blob = await (await fetch(dataUrl)).blob();
		} catch (e) {
			alert('Error convirtiendo la imagen\r\n' + e);
		}
		const file = new File(
			[blob],
			GenerarNombreFichero(),
			{
				type: 'image/jpeg',
			}
		);
		const shareData = {
			title: 'Copia de mi DNI',
			text: 'Adjunto la copia de mi DNI para su uso exclusivo',
			files: [file],
		}
		try {
			await navigator.share(shareData)
		} catch (err) {
			alert('Error: ' + err);
		}
		DesactivarModoEdicion();
	});
}

//////////////////////////////////////
//
// Gestos táctiles sobre la copia protegida
// https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures
//
//////////////////////////////////////

function initGestures() {
	const el = Previsualizacion;
	el.onpointerdown = pointerdownHandler;
	el.onpointermove = pointermoveHandler;

	// los eventos de soltar/cancelar/salir se tratan igual
	el.onpointerup = pointerupHandler;
	el.onpointercancel = pointerupHandler;
	el.onpointerout = pointerupHandler;
	el.onpointerleave = pointerupHandler;
}

/**
Calcula la distancia actual entre los dos dedos
*/
function CalcularDistancia() {
	const dx = evCache[1].clientX - evCache[0].clientX;
	const dy = evCache[1].clientY - evCache[0].clientY;
	return Math.sqrt(dx * dx + dy * dy);
}

/**
Calcula el ángulo entre los dos puntos de toque
*/
function CalcularAngulo() {
	const dx = evCache[1].clientX - evCache[0].clientX;
	const dy = evCache[1].clientY - evCache[0].clientY;
	return Math.atan2(dy, dx) * (180 / Math.PI);
}

function pointerdownHandler(ev) {
	// se guarda cada puntero activo para poder detectar gestos de dos dedos
	evCache.push(ev);

	if (evCache.length == 2) {
		// registrar datos iniciales para cambio de zoom y rotación
		distanciaInicial = CalcularDistancia();
		anguloInicial = CalcularAngulo();
		rotacionInicial = Rotacion.valueAsNumber;
		zoomInicial = Zoom.valueAsNumber;
	}
	if (evCache.length == 1)
		registrarUnPunto(ev);
}

function registrarUnPunto(ev) {
	puntoInicial = {
		x: ev.clientX,
		y: ev.clientY,
	}
	desplazamientoInicial = {
		x: Horizontal.valueAsNumber,
		y: Vertical.valueAsNumber,
	};
	escalaImagen = canvas.width / canvas.getBoundingClientRect().width;
}

function pointermoveHandler(ev) {
	// actualizar el registro de este puntero
	const index = evCache.findIndex(cachedEv => cachedEv.pointerId === ev.pointerId);
	evCache[index] = ev;

	// con dos dedos, pellizco para zoom y giro para rotación fina
	if (evCache.length === 2) {
		const cambioDistancia = CalcularDistancia() - distanciaInicial;
		ActualizarValorInput(Zoom, zoomInicial + cambioDistancia * 0.01);

		const cambioRotacion = CalcularAngulo() - anguloInicial;
		ActualizarValorInput(Rotacion, rotacionInicial + cambioRotacion);
	}

	// con un dedo, desplazamiento horizontal/vertical
	if (evCache.length == 1) {
		ActualizarValorInput(Horizontal, desplazamientoInicial.x + escalaImagen * (ev.clientX - puntoInicial.x));
		ActualizarValorInput(Vertical, desplazamientoInicial.y + escalaImagen * (ev.clientY - puntoInicial.y));
	}
}

function pointerupHandler(ev) {
	// quitar este puntero del registro
	const index = evCache.findIndex(cachedEv => cachedEv.pointerId === ev.pointerId);
	evCache.splice(index, 1);

	if (evCache.length == 1)
		registrarUnPunto(evCache[0]);
}

//////////////////////////////////////
//
// Utilidades
//
//////////////////////////////////////

/**
Detecta click o que activamos un elemento mediante el teclado con espacio o la tecla de enter
*/
function activarClickConTeclado(elmto, callback) {
	elmto.tabIndex = '0';
	elmto.addEventListener('keydown', function (ev) {
		if (ev.key == 'Enter' || ev.key == ' ')
			callback(ev.currentTarget, ev);
	});
	elmto.addEventListener('click', ev => callback(ev.currentTarget, ev));
}

/**
Asigna un valor a un input y dispara sus eventos como si lo hubiera cambiado el usuario
*/
function ActualizarValorInput(input, value) {
	input.value = value;
	input.dispatchEvent(new Event('input'));
	input.dispatchEvent(new Event('change'));
}

/**
Returns an Array with the result of a querySelectorAll call (a NodeList)
*/
function querySelector_Array(selector, root) {
	return [].slice.call((root || document).querySelectorAll(selector));
}
